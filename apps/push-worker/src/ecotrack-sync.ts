import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PushWorkerConfig } from './config.js';
import { decryptEcoTrackToken } from './ecotrack-credentials.js';

type IntegrationRow = {
  id: string;
  merchant_id: string;
  base_url: string;
  credentials_encrypted: string;
  connected_at: string;
  last_orders_scan_at: string | null;
  last_status_sync_at: string | null;
  sync_enabled: boolean;
};


type EcoTrackOrder = {
  tracking?: unknown;
  reference?: unknown;
  client?: unknown;
  phone?: unknown;
  phone_2?: unknown;
  products?: unknown;
  status?: unknown;
  created_at?: unknown;
  [key: string]: unknown;
};

type OrdersResponse = {
  data?: unknown;
  current_page?: number;
  last_page?: number;
  total?: number;
};

const API_PREFIX = '/api/v1';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PAGES_PER_SCAN = 100;
const STATUS_BATCH_SIZE = 100;
const HTTP_TIMEOUT_MS = 15_000;

function dateInAlgeria(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const approvedTenantHost =
    hostname.endsWith('.ecotrack.dz') ||
    hostname === 'platform.dhd-dz.com' ||
    hostname === 'app.conexlog-dz.com';
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !approvedTenantHost
  ) {
    throw new Error('Stored EcoTrack company URL is invalid. Reconnect the account.');
  }
  if (url.port && url.port !== '443') {
    throw new Error('EcoTrack company URL must use HTTPS on the standard port.');
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
  return url.origin + (path && path !== '/' ? path : '');
}

export function getRows(body: unknown): EcoTrackOrder[] {
  if (Array.isArray(body)) return body.filter((row): row is EcoTrackOrder => Boolean(row && typeof row === 'object'));
  if (!body || typeof body !== 'object') return [];
  const data = (body as OrdersResponse).data;
  if (Array.isArray(data)) return data.filter((row): row is EcoTrackOrder => Boolean(row && typeof row === 'object'));
  return [];
}

export function getStatusMap(body: unknown): Record<string, any> {
  if (!body || typeof body !== 'object') return {};
  const root = (body as any).data && typeof (body as any).data === 'object' ? (body as any).data : body;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return {};
  return root as Record<string, any>;
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function carrierNameFromBaseUrl(baseUrl: string): string {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  const known: Record<string, string> = {
    'platform.dhd-dz.com': 'DHD',
    'app.conexlog-dz.com': 'Conexlog',
    'anderson-ecommerce.ecotrack.dz': 'Anderson Delivery',
    'world-express.ecotrack.dz': 'World Express',
    '48hr.ecotrack.dz': '48Hr Express',
    'ecorapide-express.ecotrack.dz': 'EcoRapid',
    'msmgo.ecotrack.dz': 'MSM Go',
    'packers.ecotrack.dz': 'Packers',
    'rocketdelivery.ecotrack.dz': 'Rocket Delivery',
  };
  if (known[hostname]) return known[hostname];
  const tenant = hostname.endsWith('.ecotrack.dz')
    ? hostname.slice(0, -'.ecotrack.dz'.length)
    : 'EcoTrack';
  return tenant.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildOrderEvent(row: EcoTrackOrder, carrierName: string): Record<string, unknown> | null {
  const tracking = asText(row.tracking);
  if (!tracking) return null;
  return {
    ...row,
    tracking,
    reference: asText(row.reference) || tracking,
    client: asText(row.client),
    phone: asText(row.phone),
    products: asText(row.products),
    status: asText(row.status) || 'prete_a_expedier',
    carrier_name: carrierName,
  };
}

function buildStatusEvent(order: any, remote: any, tracking: string, carrierName: string): Record<string, unknown> {
  const activity = Array.isArray(remote?.activity) ? remote.activity : [];
  const latest = activity.length ? activity[activity.length - 1] : {};
  return {
    tracking,
    reference: asText(order.external_order_id) || tracking,
    client: asText(order.customer_name),
    phone: asText(order.customer_phone),
    products: asText(order.product_name),
    status: asText(remote?.status),
    reason: asText(latest?.reason) || asText(latest?.details),
    wilaya: asText(latest?.station) || asText(remote?.desk_commune),
    carrier_name: carrierName,
  };
}

export class EcoTrackSyncWorker {
  private readonly supabase: SupabaseClient;
  private readonly instanceId = randomUUID();
  private running = false;
  private readonly intervalMs: number;
  private lastApiRequestAt = 0;

  constructor(private readonly config: PushWorkerConfig) {
    this.intervalMs = Math.max(60_000, config.ecoTrackSyncIntervalMs || DEFAULT_INTERVAL_MS);
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseSecretKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }

  async start(): Promise<void> {
    this.running = true;
    console.log(`[EcoTrackSync]: Starting read-only account synchronizer (instance ${this.instanceId.slice(0, 8)}; interval ${this.intervalMs}ms).`);
    while (this.running) {
      await this.runCycle();
      if (this.running) await this.sleep(this.intervalMs);
    }
    console.log('[EcoTrackSync]: Synchronizer stopped.');
  }

  stop(): void {
    this.running = false;
  }

  private async runCycle(): Promise<void> {
    const { data: integrations, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .select('id, merchant_id, base_url, credentials_encrypted, connected_at, last_orders_scan_at, last_status_sync_at, sync_enabled')
      .eq('provider', 'ecotrack')
      .eq('sync_enabled', true);

    if (error) {
      console.error('[EcoTrackSync]: Could not load connected accounts:', error.message);
      return;
    }
    if (!integrations?.length) return;

    for (const integration of integrations as IntegrationRow[]) {
      if (!this.running) return;
      await this.syncIntegration(integration);
    }
  }

  private async syncIntegration(integration: IntegrationRow): Promise<void> {
    let token = '';
    try {
      if (!this.config.credentialsEncryptionKey) {
        throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing from the worker environment.');
      }
      token = decryptEcoTrackToken(
        integration.credentials_encrypted,
        integration.merchant_id,
        this.config.credentialsEncryptionKey
      );

      const { data: merchant, error: merchantError } = await (this.supabase as any)
        .from('merchants')
        .select('id, api_key, store_name')
        .eq('id', integration.merchant_id)
        .maybeSingle();

      if (merchantError || !merchant?.api_key) {
        throw new Error('Merchant API key could not be loaded for this EcoTrack connection.');
      }

      const baseUrl = normalizeBaseUrl(integration.base_url);
      const carrierName = carrierNameFromBaseUrl(baseUrl);
      const apiUrl = `${baseUrl}${API_PREFIX}`;
      const connectedDate = dateInAlgeria(new Date(integration.connected_at));
      const overlapDate = integration.last_orders_scan_at
        ? dateInAlgeria(new Date(integration.last_orders_scan_at))
        : connectedDate;
      // Keep the one-day overlap for late-arriving list entries, but never
      // import shipments created before this account was connected.
      const startDate = overlapDate < connectedDate ? connectedDate : overlapDate;
      const endDate = dateInAlgeria(new Date());

      const ordersScanned = await this.syncNewOrders({
        apiUrl, token, apiKey: merchant.api_key, startDate, endDate, carrierName,
      });

      await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          last_orders_scan_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      const statusCount = await this.syncKnownStatuses({
        apiUrl,
        token,
        apiKey: merchant.api_key,
        merchantId: integration.merchant_id,
        carrierName,
      });

      await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          last_status_sync_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error: null,
          last_error_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      console.log(`[EcoTrackSync]: Merchant ${integration.merchant_id.slice(0, 8)} synced ${ordersScanned} listed shipments and checked ${statusCount} existing tracking numbers.`);
    } catch (error: any) {
      const message = String(error?.message || 'EcoTrack synchronization failed')
        .replaceAll(token, '[redacted]')
        .slice(0, 500);
      console.error(`[EcoTrackSync]: Account ${integration.merchant_id.slice(0, 8)} failed: ${message}`);
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
      token = '';
    }
  }

  private async syncNewOrders(args: {
    apiUrl: string;
    token: string;
    apiKey: string;
    startDate: string;
    endDate: string;
    carrierName: string;
  }): Promise<number> {
    let imported = 0;
    let lastPage = 1;

    for (let page = 1; page <= lastPage; page += 1) {
      if (page > MAX_PAGES_PER_SCAN) {
        throw new Error(`EcoTrack shipment list exceeded the safety limit of ${MAX_PAGES_PER_SCAN} pages. The scan cursor was not advanced.`);
      }
      const query = new URLSearchParams({
        page: String(page),
        start_date: args.startDate,
        end_date: args.endDate,
      });
      const body = await this.requestJson(`${args.apiUrl}/get/orders?${query.toString()}`, {
        headers: { Authorization: `Bearer ${args.token}`, Accept: 'application/json' },
      });
      const rows = getRows(body);
      const response = body as OrdersResponse;
      lastPage = Math.max(1, Number(response?.last_page) || 1);

      const events = rows.map((row) => buildOrderEvent(row, args.carrierName)).filter((row): row is Record<string, unknown> => Boolean(row));
      if (events.length) {
        await this.ingestBatch(events, args.apiKey);
        imported += events.length;
      }
      if (!rows.length) break;
    }
    return imported;
  }

  private async syncKnownStatuses(args: {
    apiUrl: string;
    token: string;
    apiKey: string;
    merchantId: string;
    carrierName: string;
  }): Promise<number> {
    const batchSize = 500;
    let offset = 0;
    let checked = 0;

    while (true) {
      const { data: orders, error } = await (this.supabase as any)
        .from('orders')
        .select('external_order_id, customer_name, customer_phone, product_name, carrier_tracking_number, current_status')
        .eq('merchant_id', args.merchantId)
        .in('carrier_name', Array.from(new Set([args.carrierName, 'EcoTrack Network'])))
        .not('carrier_tracking_number', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (error) throw new Error(`Could not load EcoTrack tracking records: ${error.message}`);
      const pageRows = orders || [];
      const rows = pageRows.filter((order: any) =>
        !['delivered', 'returned', 'cancelled'].includes(String(order.current_status || '').toLowerCase())
      );

      const trackingToOrder = new Map<string, any>();
      for (const order of rows) {
        const tracking = asText(order.carrier_tracking_number);
        if (tracking) trackingToOrder.set(tracking, order);
      }

      const trackings = Array.from(trackingToOrder.keys());
      for (let i = 0; i < trackings.length; i += STATUS_BATCH_SIZE) {
        const group = trackings.slice(i, i + STATUS_BATCH_SIZE);
        const query = new URLSearchParams({
          api_token: args.token,
          trackings: group.join(','),
          status: 'all',
        });
        const body = await this.requestJson(`${args.apiUrl}/get/orders/status?${query.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        const statusMap = getStatusMap(body);
        const events: Record<string, unknown>[] = [];

        for (const tracking of group) {
          const remote = statusMap[tracking];
          const order = trackingToOrder.get(tracking);
          if (!remote || !order || !asText(remote.status)) continue;
          events.push(buildStatusEvent(order, remote, tracking, args.carrierName));
        }
        if (events.length) await this.ingestBatch(events, args.apiKey);
        checked += group.length;
      }

      offset += batchSize;
      if (pageRows.length < batchSize) break;
    }
    return checked;
  }

  private async ingestBatch(events: Record<string, unknown>[], apiKey: string): Promise<void> {
    const response = await fetch(
      `${this.config.trackingPublicBaseUrl.replace(/\/+$/, '')}/api/webhooks/ecotrack/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      }
    );

    let body: any = null;
    try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok || body?.success !== true) {
      const detail = body?.error || body?.message || `HTTP ${response.status}`;
      throw new Error(`TajerTrack ingestion failed: ${String(detail).slice(0, 300)}`);
    }
  }

  private async requestJson(url: string, init: RequestInit): Promise<any> {
    // EcoTrack tenants commonly enforce a 50 requests/minute API limit. Keep
    // requests under that ceiling across connected merchant accounts.
    const waitMs = Math.max(0, 1_250 - (Date.now() - this.lastApiRequestAt));
    if (waitMs > 0) await this.sleep(waitMs);
    this.lastApiRequestAt = Date.now();
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    let body: any = null;
    try { body = await response.json(); } catch {
      throw new Error(`EcoTrack returned a non-JSON response (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const suffix = response.status === 429 && retry ? ` Retry after ${retry} seconds.` : '';
      throw new Error(`EcoTrack API returned HTTP ${response.status}.${suffix}`);
    }
    if (body?.success === false) {
      throw new Error(String(body.message || 'EcoTrack rejected the read request').slice(0, 300));
    }
    return body;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
