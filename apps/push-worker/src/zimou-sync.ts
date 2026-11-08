import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PushWorkerConfig } from './config.js';
import { decryptZimouToken } from './zimou-credentials.js';

const API = 'https://zimou.express/api';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 50;
const TIMEOUT_MS = 15000;
type Integration = { id:string; merchant_id:string; credentials_encrypted:string; sync_enabled:boolean };

function asText(value: unknown): string { return value == null ? '' : String(value).trim(); }

export function normalizeZimouStatusResponse(body: any): Record<string, any> {
  const value = body?.data && typeof body.data === 'object' ? body.data : body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

export function normalizeZimouPackageStatuses(body: any): Record<string, string> {
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return Object.fromEntries(rows
    .filter((row: any) => row && row.id != null && typeof row.name === 'string' && row.name.trim())
    .map((row: any) => [String(row.id), row.name.trim()]));
}

export class ZimouSyncWorker {
  private readonly supabase: SupabaseClient;
  private readonly instanceId = randomUUID();
  private running = false;
  private lastApiRequestAt = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeSleep: (() => void) | null = null;
  private readonly intervalMs: number;

  constructor(private readonly config: PushWorkerConfig) {
    this.intervalMs = Math.max(60_000, config.zimouSyncIntervalMs || DEFAULT_INTERVAL_MS);
    this.supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async start(): Promise<void> {
    this.running = true;
    console.log('[ZimouSync]: Starting read-only status poller (' + this.instanceId.slice(0,8) + '; interval ' + this.intervalMs + 'ms).');
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
    const { data, error } = await (this.supabase as any)
      .from('merchant_carrier_integrations')
      .select('id,merchant_id,credentials_encrypted,sync_enabled')
      .eq('provider','zimou').eq('sync_enabled',true);
    if (error) { console.error('[ZimouSync]: Could not load accounts:', error.message); return; }
    for (const integration of (data || []) as Integration[]) {
      if (!this.running) return;
      await this.syncAccount(integration);
    }
  }

  private async syncAccount(integration: Integration): Promise<void> {
    let token = '';
    try {
      if (!this.config.credentialsEncryptionKey) throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing.');
      token = decryptZimouToken(integration.credentials_encrypted, integration.merchant_id, this.config.credentialsEncryptionKey);
      const { data: merchant, error: merchantError } = await (this.supabase as any)
        .from('merchants').select('api_key').eq('id',integration.merchant_id).maybeSingle();
      if (merchantError || !merchant?.api_key) throw new Error('Merchant API key could not be loaded.');

      const statusesUrl = new URL(API + '/v3/helpers/package-statuses');
      const statusWaitMs = Math.max(0, 1400 - (Date.now() - this.lastApiRequestAt));
      if (statusWaitMs > 0) await new Promise(resolve => setTimeout(resolve, statusWaitMs));
      this.lastApiRequestAt = Date.now();
      const statusResponse = await fetch(statusesUrl, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      let statusBody: any;
      try { statusBody = await statusResponse.json(); } catch { throw new Error('Zimou returned an invalid package-status dictionary.'); }
      if (!statusResponse.ok || statusBody?.error === 1 || statusBody?.success === false) {
        throw new Error('Could not load this Zimou account status dictionary (HTTP ' + statusResponse.status + ').');
      }
      const statusNames = normalizeZimouPackageStatuses(statusBody);
      if (!Object.keys(statusNames).length) throw new Error('Zimou returned an empty package-status dictionary; refusing to guess status meanings.');

      let offset = 0;
      let checked = 0;
      while (this.running) {
        const { data: orders, error } = await (this.supabase as any)
          .from('orders')
          .select('external_order_id,customer_name,customer_phone,product_name,carrier_tracking_number,current_status')
          .eq('merchant_id',integration.merchant_id)
          .eq('carrier_name','Zimou Express')
          .not('carrier_tracking_number','is',null)
          .order('created_at',{ascending:false})
          .range(offset,offset + 199);
        if (error) throw new Error('Could not load Zimou tracking records: ' + error.message);
        const rows = (orders || []).filter((row:any) => row.carrier_tracking_number &&
          !['delivered','returned','cancelled'].includes(String(row.current_status || '').toLowerCase()));
        const tracking: string[] = Array.from(new Set<string>(
          rows.map((row: any): string => asText(row.carrier_tracking_number))
            .filter((value: string): value is string => value.length > 0),
        ));
        for (let index=0; index<tracking.length; index+=BATCH_SIZE) {
          const batch = tracking.slice(index,index+BATCH_SIZE);
          const url = new URL(API + '/v3/packages/status');
          batch.forEach(value => url.searchParams.append('packages[]',value));
          const waitMs = Math.max(0, 1400 - (Date.now() - this.lastApiRequestAt));
          if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
          this.lastApiRequestAt = Date.now();
          const response = await fetch(url, {
            headers:{ Authorization:'Bearer ' + token, Accept:'application/json' }, redirect:'error', signal:AbortSignal.timeout(TIMEOUT_MS),
          });
          let body:any;
          try { body = await response.json(); } catch { throw new Error('Zimou returned invalid JSON (HTTP ' + response.status + ').'); }
          if (response.status === 401 || response.status === 403) throw new Error('Zimou rejected the saved API Token. Reconnect the account.');
          if (response.status === 429) throw new Error('Zimou rate limit reached; the next cycle will retry.');
          if (!response.ok || body?.error === 1 || body?.success === false) throw new Error('Zimou status request failed (HTTP ' + response.status + '): ' + asText(body?.message));
          const statusMap = normalizeZimouStatusResponse(body) as Record<string, Record<string, unknown>>;
          const events: Record<string, unknown>[] = [];
          for (const code of batch) {
            const remote = statusMap[code];
            if (!remote || typeof remote !== 'object') continue;
            const existing = rows.find((row:any) => asText(row.carrier_tracking_number) === code);
            events.push({
              ...remote,
              status_name: statusNames[asText(remote.status_id)] || asText(remote.status_name),
              tracking_code: code,
              order_id: asText(remote.order_id) || asText(existing?.external_order_id) || code,
              client_first_name: remote.client_first_name || existing?.customer_name || '',
              client_phone: remote.client_phone || existing?.customer_phone || '',
              name: remote.name || existing?.product_name || '',
            });
          }
          if (events.length) await this.ingest(events, merchant.api_key);
          checked += batch.length;
        }
        offset += 200;
        if ((orders || []).length < 200) break;
      }

      const now = new Date().toISOString();
      const { error: updateError } = await (this.supabase as any).from('merchant_carrier_integrations')
        .update({ last_sync_at:now,last_success_at:now,last_error:null,last_error_at:null,updated_at:now }).eq('id',integration.id);
      if (updateError) throw new Error('Could not save Zimou sync state: ' + updateError.message);
      console.log('[ZimouSync]: Merchant ' + integration.merchant_id.slice(0,8) + ' checked ' + checked + ' known tracking numbers.');
    } catch (error:any) {
      const rawMessage = String(error?.message || 'Zimou synchronization failed');
      const message = (token ? rawMessage.replaceAll(token,'[redacted]') : rawMessage).slice(0,500);
      console.error('[ZimouSync]: Account ' + integration.merchant_id.slice(0,8) + ' failed: ' + message);
      await (this.supabase as any).from('merchant_carrier_integrations')
        .update({last_sync_at:new Date().toISOString(),last_error:message,last_error_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',integration.id);
    } finally { token = ''; }
  }

  private async ingest(events: Record<string,unknown>[], apiKey: string): Promise<void> {
    const response = await fetch(this.config.trackingPublicBaseUrl.replace(/\/+$/,'') + '/api/webhooks/zimou/sync', {
      method:'POST', headers:{'Content-Type':'application/json','x-api-key':apiKey},
      body:JSON.stringify({events}), signal:AbortSignal.timeout(TIMEOUT_MS),
    });
    let body:any = null; try { body = await response.json(); } catch {}
    if (!response.ok || body?.success !== true) throw new Error('TajerTrack ingestion failed: ' + asText(body?.error || body?.message || ('HTTP ' + response.status)));
  }
}
