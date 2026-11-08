import { createHmac, randomUUID } from 'node:crypto';
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
  private running = false;

  constructor(private readonly config: PushWorkerConfig) {
    this.pollIntervalMs = Math.max(1000, config.yalidineWebhookPollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
    this.supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    deriveWorkerSigningKey(config.credentialsEncryptionKey);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log(`[YalidineWebhookWorker]: Started (worker ${this.workerId}, poll ${this.pollIntervalMs}ms).`);
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
    console.log('[YalidineWebhookWorker]: Stopped.');
  }

  async stop(): Promise<void> {
    this.running = false;
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
