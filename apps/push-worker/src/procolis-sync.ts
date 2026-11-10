import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PushWorkerConfig } from './config.js';
import { decryptProcolisCredentials } from './procolis-credentials.js';

const API = 'https://procolis.com/api_v1';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 650;
const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 200;
const INGEST_BATCH_SIZE = 50;

type Integration = {
  id: string;
  merchant_id: string;
  credentials_encrypted: string;
  webhook_endpoint_token: string | null;
  sync_enabled: boolean;
};

type OrderRow = {
  external_order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  carrier_tracking_number: string | null;
  current_status: string | null;
};

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** The documented /lire response is { Colis: [ ... ] }; some accounts return null for unknown tracking codes. */
export function extractProcolisOrder(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const rows = Array.isArray(root.Colis) ? root.Colis : Array.isArray(body) ? body : null;
  if (rows) {
    const first = rows.find((row) => row && typeof row === 'object');
    return first && typeof first === 'object' ? first as Record<string, unknown> : null;
  }
  if (root.Colis && typeof root.Colis === 'object') return root.Colis as Record<string, unknown>;
  if (root.Tracking || root.tracking || root.Situation || root.situation || root.Statut) return root;
  return null;
}

export function buildProcolisTrackingPayload(
  remote: Record<string, unknown>,
  tracking: string,
  order: OrderRow
): Record<string, unknown> {
  return {
    ...remote,
    Tracking: asText(remote.Tracking) || asText(remote.tracking) || tracking,
    id_Externe: asText(remote.id_Externe) || asText(remote.id_externe) || asText(order.external_order_id) || tracking,
    Client: asText(remote.Client) || asText(remote.client) || asText(order.customer_name),
    MobileA: asText(remote.MobileA) || asText(remote.mobileA) || asText(order.customer_phone),
    TProduit: asText(remote.TProduit) || asText(remote.tProduit) || asText(order.product_name),
  };
}

export class ProcolisSyncWorker {
  private readonly supabase: SupabaseClient;
  private readonly instanceId = randomUUID();
  private running = false;
  private lastApiRequestAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wake: (() => void) | null = null;
  private readonly intervalMs: number;

  constructor(private readonly config: PushWorkerConfig) {
    this.intervalMs = Math.max(60_000, config.procolisSyncIntervalMs || DEFAULT_INTERVAL_MS);
    this.supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log(`[ProcolisSync]: Starting read-only tracking poller (${this.instanceId.slice(0, 8)}; interval ${this.intervalMs}ms).`);
    while (this.running) {
      await this.runCycle();
      if (this.running) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          this.timer = setTimeout(() => {
            this.timer = null;
            this.wake = null;
            resolve();
          }, this.intervalMs);
        });
      }
    }
    console.log('[ProcolisSync]: Poller stopped.');
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.wake?.();
    this.wake = null;
  }

  private async runCycle(): Promise<void> {
    const { data, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .select('id, merchant_id, credentials_encrypted, webhook_endpoint_token, sync_enabled')
      .eq('provider', 'procolis')
      .eq('sync_enabled', true);

    if (error) {
      console.error('[ProcolisSync]: Could not load connected accounts:', error.message);
      return;
    }

    for (const integration of (data || []) as Integration[]) {
      if (!this.running) return;
      await this.syncAccount(integration);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - this.lastApiRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.lastApiRequestAt = Date.now();
  }

  private async syncAccount(integration: Integration): Promise<void> {
    let credentials: { token: string; key: string } | null = null;
    try {
      if (!this.config.credentialsEncryptionKey) {
        throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing.');
      }
      credentials = decryptProcolisCredentials(
        integration.credentials_encrypted,
        integration.merchant_id,
        this.config.credentialsEncryptionKey
      );

      if (!integration.webhook_endpoint_token || integration.webhook_endpoint_token.length < 32) {
        throw new Error('This Procolis connection has no provider-specific sync token. Re-save its credentials from the merchant dashboard.');
      }

      let offset = 0;
      let checked = 0;
      let ingested = 0;
      let ambiguous = 0;

      while (this.running) {
        const { data: rows, error } = await (this.supabase as any)
          .from('orders')
          .select('external_order_id, customer_name, customer_phone, product_name, carrier_tracking_number, current_status')
          .eq('merchant_id', integration.merchant_id)
          .eq('carrier_name', 'Procolis')
          .not('carrier_tracking_number', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new Error(`Could not load Procolis tracking records: ${error.message}`);
        const page = (rows || []) as OrderRow[];
        const byTracking = new Map<string, OrderRow[]>();
        for (const order of page) {
          const tracking = asText(order.carrier_tracking_number);
          if (!tracking) continue;
          const existing = byTracking.get(tracking) || [];
          existing.push(order);
          byTracking.set(tracking, existing);
        }

        const payloads: Record<string, unknown>[] = [];
        for (const [tracking, matchingOrders] of byTracking) {
          if (!this.running) return;
          // Reused tracking numbers are ambiguous. Never apply one parcel's
          // status to multiple merchant orders.
          if (matchingOrders.length !== 1) {
            ambiguous += 1;
            continue;
          }

          const order = matchingOrders[0];
          if (['delivered', 'returned', 'cancelled'].includes(asText(order.current_status).toLowerCase())) {
            continue;
          }

          await this.waitForRateLimit();
          const response = await fetch(`${API}/lire`, {
            method: 'POST',
            headers: {
              token: credentials.token,
              key: credentials.key,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ Colis: [{ Tracking: tracking }] }),
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          if (response.status === 401 || response.status === 403) {
            throw new Error('Procolis rejected the saved Token or Key. Reconnect this account.');
          }
          if (response.status === 429) {
            throw new Error('Procolis rate limit reached. The next sync cycle will retry.');
          }

          const responseText = await response.text();
          if (!response.ok) {
            throw new Error(`Procolis tracking request failed (HTTP ${response.status}).`);
          }
          if (!responseText.trim() || responseText.trim() === 'null') {
            checked += 1;
            continue;
          }

          let body: unknown;
          try {
            body = JSON.parse(responseText);
          } catch {
            throw new Error('Procolis returned invalid JSON for a tracking lookup.');
          }

          const remote = extractProcolisOrder(body);
          if (!remote) {
            checked += 1;
            continue;
          }
          payloads.push(buildProcolisTrackingPayload(remote, tracking, order));
          checked += 1;
        }

        for (let index = 0; index < payloads.length; index += INGEST_BATCH_SIZE) {
          const batch = payloads.slice(index, index + INGEST_BATCH_SIZE);
          const response = await fetch(
            `${this.config.trackingPublicBaseUrl.replace(/\/+$/, '')}/api/webhooks/procolis/sync`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': integration.webhook_endpoint_token,
              },
              body: JSON.stringify({ events: batch }),
              signal: AbortSignal.timeout(TIMEOUT_MS),
            }
          );

          let result: any = null;
          try { result = await response.json(); } catch { /* summarized below */ }
          if (!response.ok || result?.success !== true) {
            const detail = asText(result?.error || result?.message || `HTTP ${response.status}`);
            throw new Error(`TajerTrack Procolis ingestion failed: ${detail.slice(0, 250)}`);
          }
          ingested += batch.length;
        }

        offset += PAGE_SIZE;
        if (page.length < PAGE_SIZE) break;
      }

      const now = new Date().toISOString();
      const { error: updateError } = await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          last_sync_at: now,
          last_success_at: now,
          last_error: ambiguous
            ? `${ambiguous} tracking number(s) were skipped because they matched multiple orders.`
            : null,
          last_error_at: ambiguous ? now : null,
          updated_at: now,
        })
        .eq('id', integration.id);

      if (updateError) throw new Error(`Could not save Procolis sync state: ${updateError.message}`);
      console.log(`[ProcolisSync]: Merchant ${integration.merchant_id.slice(0, 8)} checked ${checked} tracking numbers; ingested ${ingested} updates; skipped ${ambiguous} ambiguous numbers.`);
    } catch (error: any) {
      const message = String(error?.message || 'Procolis synchronization failed')
        .replaceAll(credentials?.token || '', '[redacted]')
        .replaceAll(credentials?.key || '', '[redacted]')
        .slice(0, 500);
      console.error(`[ProcolisSync]: Account ${integration.merchant_id.slice(0, 8)} failed: ${message}`);
      await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          last_sync_at: new Date().toISOString(),
          last_error: message,
          last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);
    } finally {
      credentials = null;
    }
  }
}
