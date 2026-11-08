import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PushWorkerConfig } from './config.js';
import { decryptElogistiaApiKey } from './elogistia-credentials.js';

const API = 'https://api.elogistia.com';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1400;
const TIMEOUT_MS = 15000;

type Integration = { id: string; merchant_id: string; credentials_encrypted: string; sync_enabled: boolean };
type OrderRow = {
  id: string;
  external_order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  carrier_tracking_number: string;
  current_status: string;
};

function asText(value: unknown): string { return value == null ? '' : String(value).trim(); }

export function normalizeElogistiaHistory(body: any): Record<string, any>[] {
  let value = body?.body ?? body?.data ?? body;
  if (value && !Array.isArray(value) && Array.isArray(value.data)) value = value.data;
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === 'object');
  return value && typeof value === 'object' && (value.Statut || value.Log || value.status) ? [value] : [];
}

function parseDate(value: unknown): number {
  const raw = asText(value);
  if (!raw) return 0;
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const iso = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + hour.padStart(2, '0') + ':' + minute + ':' + second + '+01:00';
    const timestamp = new Date(iso).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  const localIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localIso) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = localIso;
    const timestamp = new Date(year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second + '+01:00').getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function createElogistiaEventId(tracking: string, event: Record<string, any>): string {
  const stable = [tracking, event.Date ?? event.date, event.Statut ?? event.statut ?? event.status, event.Log ?? event.log].map(asText).join('|');
  return createHash('sha256').update(stable, 'utf8').digest('hex');
}

export class ElogistiaSyncWorker {
  private readonly supabase: SupabaseClient;
  private readonly instanceId = randomUUID();
  private running = false;
  private lastApiRequestAt = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeSleep: (() => void) | null = null;
  private readonly intervalMs: number;

  constructor(private readonly config: PushWorkerConfig) {
    this.intervalMs = Math.max(60_000, config.elogistiaSyncIntervalMs || DEFAULT_INTERVAL_MS);
    this.supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[ElogistiaSync]: Worker ' + this.instanceId.slice(0, 8) + ' started; cycle=' + this.intervalMs + 'ms.');
    while (this.running) {
      await this.runCycle();
      if (this.running) await new Promise<void>(resolve => {
        this.wakeSleep = resolve;
        this.sleepTimer = setTimeout(() => { this.sleepTimer = null; this.wakeSleep = null; resolve(); }, this.intervalMs);
      });
    }
  }

  stop(): void {
    this.running = false;
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.wakeSleep?.();
    this.wakeSleep = null;
  }

  private async runCycle(): Promise<void> {
    const { data, error } = await (this.supabase as any).from('merchant_carrier_integrations')
      .select('id,merchant_id,credentials_encrypted,sync_enabled')
      .eq('provider', 'elogistia').eq('sync_enabled', true);
    if (error) { console.error('[ElogistiaSync]: Could not load accounts:', error.message); return; }
    for (const integration of (data || []) as Integration[]) {
      if (!this.running) return;
      await this.syncAccount(integration);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - this.lastApiRequestAt));
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    this.lastApiRequestAt = Date.now();
  }

  private async syncAccount(integration: Integration): Promise<void> {
    let apiKey = '';
    try {
      if (!this.config.credentialsEncryptionKey) throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing.');
      apiKey = decryptElogistiaApiKey(integration.credentials_encrypted, integration.merchant_id, this.config.credentialsEncryptionKey);
      const { data: merchant, error: merchantError } = await (this.supabase as any)
        .from('merchants').select('api_key').eq('id', integration.merchant_id).maybeSingle();
      if (merchantError || !merchant?.api_key) throw new Error('Merchant API key could not be loaded.');

      let offset = 0;
      let checked = 0;
      let ingested = 0;
      while (this.running) {
        const { data: orders, error } = await (this.supabase as any).from('orders')
          .select('id,external_order_id,customer_name,customer_phone,product_name,carrier_tracking_number,current_status')
          .eq('merchant_id', integration.merchant_id)
          .eq('carrier_name', 'Elogistia')
          .not('carrier_tracking_number', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + 199);
        if (error) throw new Error('Could not load Elogistia tracking records: ' + error.message);
        const rows = (orders || []) as OrderRow[];
        for (const order of rows) {
          if (!this.running) return;
          if (!order.carrier_tracking_number || ['delivered', 'returned', 'cancelled'].includes(asText(order.current_status).toLowerCase())) continue;
          await this.waitForRateLimit();
          const url = new URL('getTracking/', API + '/');
          url.searchParams.set('apiKey', apiKey);
          url.searchParams.set('tracking', order.carrier_tracking_number);
          let response: Response;
          try {
            response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
          } catch (error: any) {
            if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('Elogistia tracking request timed out.');
            throw new Error('Elogistia tracking request could not reach the API.');
          }
          if (response.status === 404) continue; // A new parcel may have no history yet.
          if (response.status === 401 || response.status === 403) throw new Error('Elogistia rejected the saved API Key. Reconnect the account.');
          if (response.status === 429) throw new Error('Elogistia rate limit reached; the next cycle will retry.');
          let body: any;
          try { body = await response.json(); } catch { throw new Error('Elogistia returned invalid JSON (HTTP ' + response.status + ').'); }
          if (!response.ok || body?.success === false || body?.error) {
            const providerMessage = asText(body?.Message || body?.message || body?.error);
            if (/not found|no log yet/i.test(providerMessage)) continue;
            throw new Error('Elogistia status request failed (HTTP ' + response.status + ').');
          }

          const history = normalizeElogistiaHistory(body).sort((a, b) => parseDate(a.Date ?? a.date) - parseDate(b.Date ?? b.date));
          if (history.length) {
            const events = history.map((event, index) => ({
              ...event,
              tracking: order.carrier_tracking_number,
              IdCommande: order.external_order_id,
              customer_name: order.customer_name || '',
              phone: order.customer_phone || '',
              product_name: order.product_name || '',
              source_event_id: createElogistiaEventId(order.carrier_tracking_number, event),
              // Import older history without replaying customer notifications; only the newest
              // event in the snapshot may fan out a notification.
              suppressTriggers: index < history.length - 1,
            }));
            for (let index = 0; index < events.length; index += 50) {
              const batch = events.slice(index, index + 50);
              await this.ingest(batch, merchant.api_key);
              ingested += batch.length;
            }
          }
          checked++;
        }
        offset += 200;
        if (rows.length < 200) break;
      }

      const now = new Date().toISOString();
      const { error: updateError } = await (this.supabase as any).from('merchant_carrier_integrations')
        .update({ last_sync_at: now, last_success_at: now, last_error: null, last_error_at: null, updated_at: now })
        .eq('id', integration.id);
      if (updateError) throw new Error('Could not save Elogistia sync state: ' + updateError.message);
      console.log('[ElogistiaSync]: Merchant ' + integration.merchant_id.slice(0, 8) + ' checked ' + checked + ' known tracking numbers; sent ' + ingested + ' history events.');
    } catch (error: any) {
      const rawMessage = String(error?.message || 'Elogistia synchronization failed');
      const message = (apiKey ? rawMessage.replaceAll(apiKey, '[redacted]') : rawMessage).slice(0, 500);
      console.error('[ElogistiaSync]: Account ' + integration.merchant_id.slice(0, 8) + ' failed: ' + message);
      await (this.supabase as any).from('merchant_carrier_integrations')
        .update({ last_sync_at: new Date().toISOString(), last_error: message, last_error_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', integration.id);
    } finally {
      apiKey = '';
    }
  }

  private async ingest(events: Record<string, unknown>[], apiKey: string): Promise<void> {
    const response = await fetch(this.config.trackingPublicBaseUrl.replace(/\/+$/, '') + '/api/webhooks/elogistia/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let body: any = null;
    try { body = await response.json(); } catch {}
    if (!response.ok || body?.success !== true) throw new Error('TajerTrack ingestion failed: ' + asText(body?.error || body?.message || ('HTTP ' + response.status)));
  }
}
