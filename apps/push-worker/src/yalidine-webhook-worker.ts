import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PushWorkerConfig } from './config.js';

type YalidineWebhookJob = {
  id: string;
  merchant_id: string;
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'retry' | 'completed' | 'dead_letter';
  attempt_count: number;
  max_attempts: number;
};

const RETRY_DELAYS_SECONDS = [5, 30, 120, 600, 1800, 3600, 7200];
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_API_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const API_BASE_URL = 'https://api.guepex.app/v1/';
const API_PAGE_SIZE = 100;
const API_MAX_PAGES_PER_CYCLE = 200;
const API_MIN_REQUEST_INTERVAL_MS = 1400;

type YalidineIntegration = {
  id: string;
  merchant_id: string;
  credentials_encrypted: string;
  last_api_sync_at: string | null;
};

type ExistingYalidineOrder = {
  id: string;
  external_order_id: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  carrier_last_event_at: string | null;
};

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeGuepexParcelList(response: any): Record<string, any>[] {
  const candidates = [response?.data, response?.body, response?.parcels, response];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    }
    if (candidate && typeof candidate === 'object') {
      for (const nested of [candidate.data, candidate.body, candidate.parcels]) {
        if (Array.isArray(nested)) {
          return nested.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
        }
      }
    }
  }
  throw new Error('Guepex returned an unexpected parcel-list format.');
}

function parseGuepexDate(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const local = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/);
  const normalized = local ? `${local[1]}T${local[2]}+01:00` : raw;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function algeriaDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const GUEPEX_PARCEL_FIELDS = [
  'tracking',
  'order_id',
  'firstname',
  'familyname',
  'contact_phone',
  'product_list',
  'price',
  'delivery_fee',
  'freeshipping',
  'last_status',
  'date_creation',
  'date_last_status',
  'import_id',
  'label',
  'to_wilaya_id',
  'to_wilaya_name',
  'to_commune_id',
  'to_commune_name',
  'is_stopdesk',
  'stopdesk_id',
  'stopdesk_name',
  'current_center_id',
  'current_center_name',
  'current_wilaya_id',
  'current_wilaya_name',
  'current_commune_id',
  'current_commune_name',
  'payment_status',
  'payment_id',
  'has_exchange',
  'product_to_collect',
  'parcel_type',
  'parcel_sub_type',
  'economic',
] as const;

export function buildGuepexParcelListUrl(
  page: number,
  lastApiSyncAt: string | null,
  now = new Date()
): URL {
  const url = new URL('parcels/', API_BASE_URL);
  url.searchParams.set('page_size', String(API_PAGE_SIZE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('order_by', 'date_last_status');
  url.searchParams.set('desc', '');
  // Explicit field selection avoids depending on the API's default projection.
  // Yalidine masks recipient PII in GET responses, but product_list and the
  // non-personal shipment metadata remain available. Never request address,
  // QR text or label PIN as part of routine synchronization.
  url.searchParams.set('fields', GUEPEX_PARCEL_FIELDS.join(','));
  if (lastApiSyncAt) {
    const fromDate = algeriaDate(new Date(Math.max(0, Date.parse(lastApiSyncAt) - 48 * 60 * 60 * 1000)));
    const toDate = algeriaDate(now);
    url.searchParams.set('date_last_status', `${fromDate},${toDate}`);
  }
  return url;
}

export function buildGuepexParcelUrl(tracking: string): URL {
  const url = new URL(`parcels/${encodeURIComponent(tracking)}`, API_BASE_URL);
  url.searchParams.set('fields', GUEPEX_PARCEL_FIELDS.join(','));
  return url;
}

export function buildGuepexParcelsByOrderIdsUrl(orderIds: string[]): URL {
  const url = new URL('parcels/', API_BASE_URL);
  url.searchParams.set('order_id', Array.from(new Set(orderIds.map(asText).filter(Boolean))).join(','));
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '100');
  url.searchParams.set('fields', GUEPEX_PARCEL_FIELDS.join(','));
  return url;
}

export function normalizeGuepexParcel(response: any, expectedTracking = ''): Record<string, any> | null {
  const queue: any[] = [response?.data, response?.body, response?.parcel, response];
  const visited = new Set<any>();
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) continue;
    visited.add(candidate);

    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }

    const tracking = asText(candidate.tracking || candidate.Tracking || candidate.tracking_number) || expectedTracking;
    const hasParcelFields = GUEPEX_PARCEL_FIELDS.some((key) => candidate[key] !== undefined);
    if (tracking && hasParcelFields) {
      return { ...candidate, tracking };
    }

    for (const key of ['data', 'body', 'parcel']) {
      if (candidate[key] && typeof candidate[key] === 'object') queue.push(candidate[key]);
    }
  }
  return null;
}

export function createGuepexApiEnrichmentEvent(
  merchantId: string,
  parcel: Record<string, any>,
  fallbackTracking = '',
  fallbackOrderId = '',
  receivedAt = new Date().toISOString()
): Record<string, unknown> | null {
  const tracking = asText(parcel.tracking || parcel.Tracking || fallbackTracking);
  if (!tracking) return null;

  const data: Record<string, unknown> = {};
  for (const key of GUEPEX_PARCEL_FIELDS) {
    const value = parcel[key];
    if (value !== undefined && value !== null && value !== '') data[key] = value;
  }
  data.tracking = tracking;
  const orderId = asText(parcel.order_id || fallbackOrderId);
  if (orderId) data.order_id = orderId;
  data.__guepex_api_lookup = true;

  const occurredAt = parseGuepexDate(parcel.date_last_status || parcel.date_creation) || receivedAt;
  const digest = createHash('sha256')
    .update(JSON.stringify(Object.keys(data).sort().map((key) => [key, data[key]])), 'utf8')
    .digest('hex');
  const eventId = `api-enrichment:${digest}`;

  return {
    merchant_id: merchantId,
    event_id: eventId,
    event_type: 'parcel_edited',
    occurred_at: occurredAt,
    payload: {
      type: 'parcel_edited',
      event_id: eventId,
      occurred_at: occurredAt,
      data,
    },
    status: 'pending',
    available_at: receivedAt,
  };
}

export function createGuepexApiEvent(
  merchantId: string,
  parcel: Record<string, any>,
  existingOrder: ExistingYalidineOrder,
  receivedAt = new Date().toISOString()
): Record<string, unknown> | null {
  const tracking = asText(parcel.tracking || parcel.Tracking);
  if (!tracking) return null;

  const orderReference = asText(parcel.order_id) || tracking;
  const occurredAt = parseGuepexDate(parcel.date_last_status || parcel.date_creation);
  if (!occurredAt) return null;

  const linkedByTracking = Boolean(
    existingOrder.carrier_tracking_number &&
    existingOrder.carrier_tracking_number.toLowerCase() === tracking.toLowerCase()
  );
  if (
    existingOrder.carrier_name &&
    !['Yalidine Express', 'Guepex', 'Yalidine'].includes(existingOrder.carrier_name)
  ) {
    return null;
  }

  const previousEventAt = existingOrder.carrier_last_event_at
    ? Date.parse(existingOrder.carrier_last_event_at)
    : 0;
  const eventAt = Date.parse(occurredAt);
  const eventType = !linkedByTracking
    ? 'parcel_created'
    : previousEventAt > 0 && eventAt <= previousEventAt
      ? 'parcel_edited'
      : 'parcel_status_updated';

  const data: Record<string, unknown> = {};
  for (const key of GUEPEX_PARCEL_FIELDS) {
    const value = parcel[key];
    if (value !== undefined && value !== null && value !== '') data[key] = value;
  }
  data.tracking = tracking;
  data.order_id = orderReference;
  if (data.last_status && eventType === 'parcel_status_updated') {
    data.status = data.last_status;
  }

  // Exclude address, PIN, QR text and every other nonessential personal/security field.
  const stableContent = Object.keys(data).sort().map((key) => [key, data[key]]);
  const digest = createHash('sha256')
    .update(JSON.stringify([eventType, stableContent]), 'utf8')
    .digest('hex');
  const eventId = `api:${digest}`;

  return {
    merchant_id: merchantId,
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    payload: {
      type: eventType,
      event_id: eventId,
      occurred_at: occurredAt,
      data,
    },
    status: 'pending',
    available_at: receivedAt,
  };
}

function deriveWorkerSigningKey(rootKey: string): Buffer {
  if (!rootKey || rootKey.length < 32) {
    throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is required for Yalidine webhook worker authentication.');
  }
  return createHmac('sha256', rootKey)
    .update('tajertrack:yalidine:worker-request:v1', 'utf8')
    .digest();
}

export class YalidineWebhookWorker {
  private readonly supabase: SupabaseClient;
  private readonly workerId = `yl-webhook-${randomUUID()}`;
  private readonly pollIntervalMs: number;
  private readonly apiSyncIntervalMs: number;
  private running = false;
  private lastApiRequestAt = 0;
  private apiSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private apiSyncWake: (() => void) | null = null;

  constructor(private readonly config: PushWorkerConfig) {
    this.pollIntervalMs = Math.max(1000, config.yalidineWebhookPollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
    this.apiSyncIntervalMs = Math.max(60_000, config.yalidineApiSyncIntervalMs || DEFAULT_API_SYNC_INTERVAL_MS);
    this.supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    deriveWorkerSigningKey(config.credentialsEncryptionKey);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log(`[YalidineWebhookWorker]: Started (worker ${this.workerId}, queue poll ${this.pollIntervalMs}ms, API sync ${this.config.yalidineApiSyncEnabled ? this.apiSyncIntervalMs + 'ms' : 'disabled'}).`);
    const apiLoop = this.config.yalidineApiSyncEnabled ? this.runApiSyncLoop() : Promise.resolve();
    while (this.running) {
      try {
        const job = await this.claimNext();
        if (!job) {
          await this.sleep(this.pollIntervalMs);
          continue;
        }
        await this.process(job);
      } catch (error: any) {
        console.error('[YalidineWebhookWorker]: Main loop error:', error?.message || error);
        if (this.running) await this.sleep(this.pollIntervalMs);
      }
    }
    await apiLoop;
    console.log('[YalidineWebhookWorker]: Stopped.');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.apiSyncTimer) clearTimeout(this.apiSyncTimer);
    this.apiSyncTimer = null;
    this.apiSyncWake?.();
    this.apiSyncWake = null;
  }

  private async runApiSyncLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.syncApiAccounts();
      } catch (error: any) {
        console.error('[YalidineApiSync]: Cycle failed:', error?.message || error);
      }
      if (!this.running) return;
      await new Promise<void>((resolve) => {
        this.apiSyncWake = resolve;
        this.apiSyncTimer = setTimeout(() => {
          this.apiSyncTimer = null;
          this.apiSyncWake = null;
          resolve();
        }, this.apiSyncIntervalMs);
      });
    }
  }

  private apiRateLimitTail: Promise<void> = Promise.resolve();

  private async waitForApiRateLimit(): Promise<void> {
    const previous = this.apiRateLimitTail;
    let release!: () => void;
    this.apiRateLimitTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const waitMs = Math.max(0, API_MIN_REQUEST_INTERVAL_MS - (Date.now() - this.lastApiRequestAt));
      if (waitMs > 0) await this.sleep(waitMs);
      this.lastApiRequestAt = Date.now();
    } finally {
      release();
    }
  }

  private async fetchGuepexParcel(
    apiId: string,
    apiToken: string,
    tracking: string
  ): Promise<Record<string, any> | null> {
    await this.waitForApiRateLimit();
    let response: Response;
    try {
      response = await fetch(buildGuepexParcelUrl(tracking), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-ID': apiId,
          'X-API-TOKEN': apiToken,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error('Guepex single-parcel request timed out.');
      }
      throw new Error('Guepex single-parcel request could not reach the API.');
    }

    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) {
      throw new Error('Guepex rejected the saved API ID or API Token.');
    }
    if (response.status === 429) {
      throw new Error('Guepex API rate limit reached during single-parcel lookup.');
    }
    if (!response.ok) {
      throw new Error(`Guepex single-parcel request failed (HTTP ${response.status}).`);
    }

    let body: any;
    try { body = await response.json(); } catch {
      throw new Error('Guepex returned invalid JSON for a single-parcel lookup.');
    }
    if (body?.success === false || body?.error) {
      throw new Error('Guepex rejected the single-parcel lookup.');
    }
    return normalizeGuepexParcel(body, tracking);
  }

  private async recordBackfillCheck(
    order: { id: string; carrier_metadata: Record<string, unknown> | null },
    outcome: 'not_found' | 'no_details' | 'ambiguous'
  ): Promise<void> {
    const metadata = order.carrier_metadata && typeof order.carrier_metadata === 'object' && !Array.isArray(order.carrier_metadata)
      ? order.carrier_metadata
      : {};
    const now = new Date().toISOString();
    const { error } = await (this.supabase as any)
      .from('orders')
      .update({
        carrier_metadata: {
          ...metadata,
          yalidine_api_details_checked_at: now,
          yalidine_api_details_result: outcome,
        },
        updated_at: now,
      })
      .eq('id', order.id);
    if (error) throw new Error('Could not save Yalidine detail-backfill state: ' + error.message);
  }

  private async backfillExistingOrders(
    integration: YalidineIntegration,
    apiId: string,
    apiToken: string
  ): Promise<{ checked: number; queued: number }> {
    const BACKFILL_BATCH_SIZE = 20;
    const { data: orders, error } = await (this.supabase as any)
      .from('orders')
      .select('id, external_order_id, carrier_tracking_number, carrier_metadata')
      .eq('merchant_id', integration.merchant_id)
      .in('carrier_name', ['Yalidine Express', 'Guepex', 'Yalidine'])
      .not('carrier_tracking_number', 'is', null)
      .is('carrier_metadata->>yalidine_api_details_checked_at', null)
      .order('created_at', { ascending: true })
      .limit(BACKFILL_BATCH_SIZE);

    if (error) throw new Error('Could not find existing Yalidine orders for detail backfill: ' + error.message);

    let checked = 0;
    let queued = 0;
    for (const order of (orders || []) as Array<{
      id: string;
      external_order_id: string;
      carrier_tracking_number: string;
      carrier_metadata: Record<string, unknown> | null;
    }>) {
      if (!this.running) break;
      const tracking = asText(order.carrier_tracking_number);
      if (!tracking) continue;

      // Keep the distributed account lease alive during a batch of direct lookups.
      await this.renewApiSyncLease(integration.id);
      const parcel = await this.fetchGuepexParcel(apiId, apiToken, tracking);
      checked += 1;
      if (!parcel) {
        await this.recordBackfillCheck(order, 'not_found');
        continue;
      }

      const event = createGuepexApiEnrichmentEvent(
        integration.merchant_id,
        parcel,
        tracking,
        order.external_order_id || ''
      );
      if (!event) {
        await this.recordBackfillCheck(order, 'no_details');
        continue;
      }

      const { error: enqueueError } = await (this.supabase as any)
        .from('yalidine_webhook_events')
        .upsert([event], {
          onConflict: 'merchant_id,event_id',
          ignoreDuplicates: true,
        });
      if (enqueueError) throw new Error('Could not queue existing Yalidine order for detail enrichment: ' + enqueueError.message);
      queued += 1;
    }
    return { checked, queued };
  }

  private async backfillExistingOrdersByOrderId(
    integration: YalidineIntegration,
    apiId: string,
    apiToken: string
  ): Promise<{ checked: number; queued: number }> {
    const BATCH_SIZE = 20;
    const columns = 'id, external_order_id, carrier_tracking_number, carrier_name, carrier_metadata';
    const baseQuery = () => (this.supabase as any)
      .from('orders')
      .select(columns)
      .eq('merchant_id', integration.merchant_id)
      .is('carrier_tracking_number', null)
      .not('external_order_id', 'is', null)
      .is('carrier_metadata->>yalidine_api_details_checked_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    const [unassigned, yalidineLinked] = await Promise.all([
      baseQuery().is('carrier_name', null),
      baseQuery().in('carrier_name', ['Yalidine Express', 'Guepex', 'Yalidine']),
    ]);
    if (unassigned.error) throw new Error('Could not find unlinked TajerTrack orders for Guepex reference backfill: ' + unassigned.error.message);
    if (yalidineLinked.error) throw new Error('Could not find unlinked Yalidine orders for Guepex reference backfill: ' + yalidineLinked.error.message);

    const ordersById = new Map<string, {
      id: string;
      external_order_id: string;
      carrier_tracking_number: string | null;
      carrier_name: string | null;
      carrier_metadata: Record<string, unknown> | null;
    }>();
    for (const order of [...(unassigned.data || []), ...(yalidineLinked.data || [])]) {
      if (order?.id && order?.external_order_id) ordersById.set(order.id, order);
    }
    const orders = Array.from(ordersById.values()).slice(0, BATCH_SIZE);
    if (!orders.length) return { checked: 0, queued: 0 };

    const orderIds = Array.from(new Set(orders.map((order) => asText(order.external_order_id)).filter(Boolean)));
    const url = buildGuepexParcelsByOrderIdsUrl(orderIds);
    await this.waitForApiRateLimit();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-ID': apiId,
          'X-API-TOKEN': apiToken,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error('Guepex order-reference backfill request timed out.');
      }
      throw new Error('Guepex order-reference backfill request could not reach the API.');
    }

    if (response.status === 401 || response.status === 403) throw new Error('Guepex rejected the saved API ID or API Token.');
    if (response.status === 429) throw new Error('Guepex API rate limit reached during order-reference backfill.');
    if (!response.ok) throw new Error(`Guepex order-reference lookup failed (HTTP ${response.status}).`);

    let body: any;
    try { body = await response.json(); } catch {
      throw new Error('Guepex returned invalid JSON for order-reference backfill.');
    }
    if (body?.success === false || body?.error) throw new Error('Guepex rejected the order-reference lookup.');

    const parcels = normalizeGuepexParcelList(body);
    const parcelsByOrderId = new Map<string, Record<string, any>[]>();
    for (const parcel of parcels) {
      const reference = asText(parcel.order_id).toLowerCase();
      if (!reference) continue;
      const list = parcelsByOrderId.get(reference) || [];
      list.push(parcel);
      parcelsByOrderId.set(reference, list);
    }

    let checked = 0;
    let queued = 0;
    for (const order of orders) {
      if (!this.running) break;
      checked += 1;
      const reference = asText(order.external_order_id);
      const matches = parcelsByOrderId.get(reference.toLowerCase()) || [];
      if (matches.length === 0) {
        await this.recordBackfillCheck(order, 'not_found');
        continue;
      }
      if (matches.length > 1) {
        // A reused store reference can represent multiple parcels. Do not
        // attach one arbitrarily; keep the original TajerTrack order untouched.
        await this.recordBackfillCheck(order, 'ambiguous');
        continue;
      }

      const event = createGuepexApiEnrichmentEvent(
        integration.merchant_id,
        matches[0],
        '',
        reference
      );
      if (!event) {
        await this.recordBackfillCheck(order, 'no_details');
        continue;
      }
      const { error: enqueueError } = await (this.supabase as any)
        .from('yalidine_webhook_events')
        .upsert([event], {
          onConflict: 'merchant_id,event_id',
          ignoreDuplicates: true,
        });
      if (enqueueError) throw new Error('Could not queue reference-matched TajerTrack order for enrichment: ' + enqueueError.message);
      queued += 1;
    }

    return { checked, queued };
  }

  private async enrichWebhookEventFromApi(job: YalidineWebhookJob): Promise<void> {
    if (!['parcel_created', 'parcel_edited', 'parcel_status_updated'].includes(job.event_type)) return;
    const eventPayload = job.payload as Record<string, any>;
    const originalData = eventPayload?.data;
    if (!originalData || typeof originalData !== 'object' || Array.isArray(originalData)) return;
    const tracking = asText(originalData.tracking || originalData.tracking_number || originalData.Tracking);
    if (!tracking) return;

    const { data: integration, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .select('id, merchant_id, credentials_encrypted')
      .eq('provider', 'yalidine')
      .eq('merchant_id', job.merchant_id)
      .eq('api_sync_enabled', true)
      .maybeSingle();
    if (error) {
      console.warn('[YalidineApiLookup]: Could not load API integration for webhook:', error.message);
      return;
    }
    if (!integration?.credentials_encrypted) return;

    let apiId = '';
    let apiToken = '';
    try {
      const { decryptYalidineApiCredentials } = await import('./yalidine-credentials.js');
      const credentials = decryptYalidineApiCredentials(
        integration.credentials_encrypted,
        job.merchant_id,
        this.config.credentialsEncryptionKey
      );
      apiId = credentials.apiId;
      apiToken = credentials.apiToken;

      const parcel = await this.fetchGuepexParcel(apiId, apiToken, tracking);
      if (!parcel) {
        console.log('[YalidineApiLookup]: No API parcel found for webhook tracking ' + tracking.slice(0, 8) + '.');
        return;
      }

      const returnedTracking = asText(parcel.tracking);
      if (returnedTracking && returnedTracking.toLowerCase() !== tracking.toLowerCase()) {
        console.warn('[YalidineApiLookup]: Guepex returned a different tracking number; ignored lookup result.');
        return;
      }

      const enrichedData: Record<string, unknown> = { ...originalData };
      for (const key of GUEPEX_PARCEL_FIELDS) {
        const value = parcel[key];
        if (value !== undefined && value !== null && value !== '') enrichedData[key] = value;
      }
      enrichedData.tracking = tracking;
      enrichedData.__guepex_api_lookup = true;

      const enrichedPayload = { ...eventPayload, data: enrichedData };
      const { error: updateError } = await (this.supabase as any)
        .from('yalidine_webhook_events')
        .update({ payload: enrichedPayload, updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('status', 'processing')
        .eq('locked_by', this.workerId);
      if (updateError) throw new Error('Could not save Guepex lookup details to the queued webhook: ' + updateError.message);
      job.payload = enrichedPayload;
      console.log('[YalidineApiLookup]: Enriched ' + job.event_type + ' from Guepex API for tracking ' + tracking.slice(0, 8) + '.');
    } catch (error: any) {
      let message = String(error?.message || 'Guepex single-parcel lookup failed');
      if (apiId) message = message.replaceAll(apiId, '[redacted]');
      if (apiToken) message = message.replaceAll(apiToken, '[redacted]');
      console.warn('[YalidineApiLookup]: Best-effort lookup failed; webhook payload will still be processed: ' + message.slice(0, 300));
      await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          api_last_error: message.slice(0, 500),
          api_last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);
    } finally {
      apiId = '';
      apiToken = '';
    }
  }

  private async syncApiAccounts(): Promise<void> {
    const { data, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .select('id, merchant_id, credentials_encrypted, last_api_sync_at')
      .eq('provider', 'yalidine')
      .eq('api_sync_enabled', true);

    if (error) {
      console.error('[YalidineApiSync]: Could not load connected API accounts:', error.message);
      return;
    }

    for (const integration of (data || []) as YalidineIntegration[]) {
      if (!this.running) return;
      await this.syncApiAccount(integration);
    }
  }

  private async claimApiSyncLease(integrationId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const { data, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        api_sync_locked_by: this.workerId,
        api_sync_lease_expires_at: leaseUntil,
        updated_at: now,
      })
      .eq('id', integrationId)
      .or(`api_sync_lease_expires_at.is.null,api_sync_lease_expires_at.lt.${now}`)
      .select('id')
      .maybeSingle();

    if (error) throw new Error('Could not claim Guepex API synchronization lease: ' + error.message);
    return Boolean(data?.id);
  }

  private async renewApiSyncLease(integrationId: string): Promise<void> {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const { data, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        api_sync_lease_expires_at: leaseUntil,
        updated_at: now,
      })
      .eq('id', integrationId)
      .eq('api_sync_locked_by', this.workerId)
      .select('id')
      .maybeSingle();

    if (error) throw new Error('Could not renew Guepex API synchronization lease: ' + error.message);
    if (!data?.id) throw new Error('Guepex API synchronization lease was lost.');
  }

  private async releaseApiSyncLease(integrationId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        api_sync_locked_by: null,
        api_sync_lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId)
      .eq('api_sync_locked_by', this.workerId);

    if (error) {
      console.warn('[YalidineApiSync]: Could not release merchant API sync lease:', error.message);
    }
  }

  private async syncApiAccount(integration: YalidineIntegration): Promise<void> {
    let apiId = '';
    let apiToken = '';
    let leaseAcquired = false;
    try {
      leaseAcquired = await this.claimApiSyncLease(integration.id);
      if (!leaseAcquired) return;

      const { decryptYalidineApiCredentials } = await import('./yalidine-credentials.js');
      const credentials = decryptYalidineApiCredentials(
        integration.credentials_encrypted,
        integration.merchant_id,
        this.config.credentialsEncryptionKey
      );
      apiId = credentials.apiId;
      apiToken = credentials.apiToken;

      const now = new Date();
      let page = 1;
      let pagesRead = 0;
      let parcelsRead = 0;
      let eventsQueued = 0;
      let missingTracking = 0;

      while (this.running) {
        if (pagesRead >= API_MAX_PAGES_PER_CYCLE) {
          throw new Error('Guepex API synchronization exceeded the per-cycle pagination safety limit. The sync cursor was not advanced.');
        }

        await this.renewApiSyncLease(integration.id);
        await this.waitForApiRateLimit();
        const url = buildGuepexParcelListUrl(page, integration.last_api_sync_at, now);

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-API-ID': apiId,
              'X-API-TOKEN': apiToken,
            },
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
          });
        } catch (error: any) {
          if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            throw new Error('Guepex parcel-list request timed out.');
          }
          throw new Error('Guepex parcel-list request could not reach the API.');
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('Guepex rejected the saved API ID or API Token. Reconnect the account.');
        }
        if (response.status === 429) {
          throw new Error('Guepex API rate limit reached; the next synchronization cycle will retry.');
        }
        if (!response.ok) {
          throw new Error(`Guepex parcel-list request failed (HTTP ${response.status}).`);
        }

        let body: any;
        try { body = await response.json(); } catch {
          throw new Error('Guepex returned invalid JSON for its parcel list.');
        }
        if (body?.success === false || body?.error) {
          throw new Error('Guepex rejected the parcel-list request.');
        }

        const parcels = normalizeGuepexParcelList(body);
        pagesRead += 1;
        parcelsRead += parcels.length;
        if (parcels.length) {
          eventsQueued += await this.enqueueApiParcelSnapshots(integration.merchant_id, parcels);
          missingTracking += parcels.filter((parcel) => !asText(parcel.tracking)).length;
        }

        const hasMore = body?.has_more === true || body?.hasMore === true || Boolean(body?.links?.next);
        if (!hasMore && parcels.length < API_PAGE_SIZE) break;
        if (!hasMore && parcels.length === 0) break;
        page += 1;
      }

      const trackingBackfill = await this.backfillExistingOrders(integration, apiId, apiToken);
      const referenceBackfill = await this.backfillExistingOrdersByOrderId(integration, apiId, apiToken);
      const backfill = {
        checked: trackingBackfill.checked + referenceBackfill.checked,
        queued: trackingBackfill.queued + referenceBackfill.queued,
      };

      const syncedAt = new Date().toISOString();
      const { data: savedSyncState, error: updateError } = await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          last_api_sync_at: syncedAt,
          api_last_error: null,
          api_last_error_at: null,
          updated_at: syncedAt,
        })
        .eq('id', integration.id)
        .eq('api_sync_locked_by', this.workerId)
        .select('id')
        .maybeSingle();
      if (updateError) throw new Error('Could not save Guepex API synchronization state: ' + updateError.message);
      if (!savedSyncState?.id) throw new Error('Guepex API synchronization lease was lost before its cursor could be saved.');

      console.log(
        '[YalidineApiSync]: Merchant ' + integration.merchant_id.slice(0, 8) +
        ' read ' + parcelsRead + ' parcels in ' + pagesRead + ' pages; queued ' +
        eventsQueued + ' linked snapshots; backfilled ' + backfill.checked + ' existing orders and queued ' + backfill.queued + ' detail lookups' +
        (missingTracking ? '; skipped ' + missingTracking + ' rows without tracking' : '') + '.'
      );
    } catch (error: any) {
      let safeMessage = String(error?.message || 'Guepex API synchronization failed');
      if (apiId) safeMessage = safeMessage.replaceAll(apiId, '[redacted]');
      if (apiToken) safeMessage = safeMessage.replaceAll(apiToken, '[redacted]');
      const message = safeMessage.slice(0, 500);
      const failedAt = new Date().toISOString();
      console.error('[YalidineApiSync]: Merchant ' + integration.merchant_id.slice(0, 8) + ' failed: ' + message);
      await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          api_last_error: message,
          api_last_error_at: failedAt,
          updated_at: failedAt,
        })
        .eq('id', integration.id)
        .eq('api_sync_locked_by', this.workerId);
    } finally {
      if (leaseAcquired) await this.releaseApiSyncLease(integration.id);
      apiId = '';
      apiToken = '';
    }
  }

  private async enqueueApiParcelSnapshots(
    merchantId: string,
    parcels: Record<string, any>[]
  ): Promise<number> {
    const trackingNumbers = Array.from(new Set(parcels.map((parcel) => asText(parcel.tracking)).filter(Boolean)));
    const externalOrderIds = Array.from(new Set(parcels.map((parcel) => asText(parcel.order_id)).filter(Boolean)));
    if (trackingNumbers.length === 0 && externalOrderIds.length === 0) return 0;

    const existingByTracking = new Map<string, ExistingYalidineOrder>();
    const existingByExternalId = new Map<string, ExistingYalidineOrder>();

    if (trackingNumbers.length) {
      const { data, error } = await (this.supabase as any)
        .from('orders')
        .select('id, external_order_id, carrier_name, carrier_tracking_number, carrier_last_event_at')
        .eq('merchant_id', merchantId)
        .in('carrier_tracking_number', trackingNumbers);
      if (error) throw new Error('Could not match Guepex tracking numbers to TajerTrack orders: ' + error.message);
      for (const order of (data || []) as ExistingYalidineOrder[]) {
        if (order.carrier_tracking_number) existingByTracking.set(order.carrier_tracking_number.toLowerCase(), order);
      }
    }

    if (externalOrderIds.length) {
      const { data, error } = await (this.supabase as any)
        .from('orders')
        .select('id, external_order_id, carrier_name, carrier_tracking_number, carrier_last_event_at')
        .eq('merchant_id', merchantId)
        .in('external_order_id', externalOrderIds);
      if (error) throw new Error('Could not match Guepex order references to TajerTrack orders: ' + error.message);
      for (const order of (data || []) as ExistingYalidineOrder[]) {
        if (order.external_order_id) existingByExternalId.set(order.external_order_id, order);
      }
    }

    const receivedAt = new Date().toISOString();
    const queueRows: Record<string, unknown>[] = [];
    for (const parcel of parcels) {
      const tracking = asText(parcel.tracking);
      if (!tracking) continue;
      const orderReference = asText(parcel.order_id);
      const existing = existingByTracking.get(tracking.toLowerCase()) ||
        (orderReference ? existingByExternalId.get(orderReference) : undefined);
      // API account scans are intentionally reconciliation-only. The webhook
      // remains responsible for unknown orders so historical account scans do
      // not import thousands of unrelated or quota-consuming orders.
      if (!existing) continue;

      const row = createGuepexApiEvent(merchantId, parcel, existing, receivedAt);
      if (row) queueRows.push(row);
    }

    for (let index = 0; index < queueRows.length; index += 100) {
      const batch = queueRows.slice(index, index + 100);
      const { error } = await (this.supabase as any)
        .from('yalidine_webhook_events')
        .upsert(batch, {
          onConflict: 'merchant_id,event_id',
          ignoreDuplicates: true,
        });
      if (error) throw new Error('Could not queue Guepex API parcel snapshots: ' + error.message);
    }

    return queueRows.length;
  }

  private async claimNext(): Promise<YalidineWebhookJob | null> {
    const { data, error } = await this.supabase.rpc('claim_next_yalidine_webhook_event', {
      p_worker_id: this.workerId,
      p_lease_seconds: 180,
    });
    if (error) {
      console.error('[YalidineWebhookWorker]: Could not claim queued event:', error.message);
      await this.sleep(Math.max(this.pollIntervalMs, 5000));
      return null;
    }
    return (data?.[0] as YalidineWebhookJob | undefined) || null;
  }

  private async process(job: YalidineWebhookJob): Promise<void> {
    const startedAt = Date.now();
    try {
      if (
        !job.payload ||
        job.payload.event_id !== job.event_id ||
        job.payload.type !== job.event_type ||
        Date.parse(String(job.payload.occurred_at)) !== Date.parse(job.occurred_at)
      ) {
        throw new Error('Queued Yalidine event envelope is inconsistent.');
      }

      // Look up the exact parcel immediately when a signed webhook carries its tracking ID.
      // This is best-effort: the verified webhook is still processed if Guepex is temporarily unavailable.
      await this.enrichWebhookEventFromApi(job);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ eventId: job.id, workerId: this.workerId });
      const signature = createHmac('sha256', deriveWorkerSigningKey(this.config.credentialsEncryptionKey))
        .update(`${timestamp}.${body}`, 'utf8')
        .digest('base64');
      const processorUrl = new URL(
        '/api/internal/yalidine/process',
        this.config.trackingPublicBaseUrl
      ).toString();

      let response: Response;
      try {
        response = await fetch(processorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-yalidine-worker-timestamp': timestamp,
            'x-yalidine-worker-signature': signature,
          },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(45_000),
        });
      } catch {
        throw new Error('Could not reach TajerTrack internal Yalidine processor.');
      }

      const rawResult = await response.text().catch(() => '');
      let result: any = null;
      if (rawResult) {
        try { result = JSON.parse(rawResult); } catch { result = null; }
      }
      if (!response.ok || result?.success !== true) {
        const detail = typeof result?.error === 'string'
          ? result.error
          : `Internal processor returned HTTP ${response.status}.`;
        await this.failOrRetry(job, new Error(detail), result?.retryable === false);
        return;
      }

      const now = new Date().toISOString();
      const { data: completedJob, error: completeError } = await (this.supabase as any)
        .from('yalidine_webhook_events')
        .update({
          status: 'completed',
          processed_at: now,
          last_error: null,
          locked_by: null,
          locked_at: null,
          lease_expires_at: null,
          updated_at: now,
        })
        .eq('id', job.id)
        .eq('status', 'processing')
        .eq('locked_by', this.workerId)
        .select('id')
        .maybeSingle();

      if (completeError) throw completeError;
      if (!completedJob) {
        console.warn(`[YalidineWebhookWorker]: Lease for event ${job.event_id.slice(0, 10)} was lost before completion.`);
        return;
      }

      await (this.supabase as any)
        .from('merchant_carrier_integrations')
        .update({
          last_webhook_processed_at: now,
          last_sync_at: now,
          last_success_at: now,
          last_error: null,
          last_error_at: null,
          updated_at: now,
        })
        .eq('merchant_id', job.merchant_id)
        .eq('provider', 'yalidine');

      console.log(
        `[YalidineWebhookWorker]: Processed ${job.event_type} (${job.event_id.slice(0, 10)}) in ${Date.now() - startedAt}ms; deduplicated: ${Boolean(result.deduplicated)}.`
      );
    } catch (error: any) {
      await this.failOrRetry(job, error);
    }
  }

  private async failOrRetry(job: YalidineWebhookJob, error: unknown, forceDeadLetter = false): Promise<void> {
    const message = String((error as any)?.message || 'Unknown Yalidine webhook processing error').slice(0, 500);
    const permanent = forceDeadLetter || job.attempt_count >= job.max_attempts;
    const delaySeconds = RETRY_DELAYS_SECONDS[
      Math.min(Math.max(job.attempt_count - 1, 0), RETRY_DELAYS_SECONDS.length - 1)
    ];
    const now = new Date();
    const { data: updatedJob, error: updateError } = await (this.supabase as any)
      .from('yalidine_webhook_events')
      .update({
        status: permanent ? 'dead_letter' : 'retry',
        available_at: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
        last_error: message,
        locked_by: null,
        locked_at: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'processing')
      .eq('locked_by', this.workerId)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('[YalidineWebhookWorker]: Could not persist failure state:', updateError.message);
      return;
    }
    if (!updatedJob) {
      console.warn(`[YalidineWebhookWorker]: Lease for event ${job.event_id.slice(0, 10)} was lost; skipping stale retry update.`);
      return;
    }

    await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        last_sync_at: now.toISOString(),
        last_error: message,
        last_error_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('merchant_id', job.merchant_id)
      .eq('provider', 'yalidine');

    console.error(
      `[YalidineWebhookWorker]: ${permanent ? 'Dead-lettered' : 'Scheduled retry for'} event ${job.event_id.slice(0, 10)} (attempt ${job.attempt_count}/${job.max_attempts}): ${message}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
