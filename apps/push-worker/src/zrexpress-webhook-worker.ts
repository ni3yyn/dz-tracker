import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  TrackingOrchestrator,
  ZRExpressWebhookAdapter,
  type ZRExpressWebhookEvent,
} from '@saas/orchestrator';
import type { PushWorkerConfig } from './config.js';

type ZRWebhookJob = {
  id: string;
  merchant_id: string;
  svix_id: string;
  event_type: string;
  occurred_at: string;
  payload: ZRExpressWebhookEvent;
  status: 'pending' | 'processing' | 'retry' | 'completed' | 'dead_letter';
  attempt_count: number;
  max_attempts: number;
};

const RETRY_DELAYS_SECONDS = [5, 30, 120, 600, 1800, 3600, 7200];
const DEFAULT_POLL_INTERVAL_MS = 2000;

export class ZRExpressWebhookWorker {
  private readonly supabase;
  private readonly workerId = `zr-webhook-${randomUUID()}`;
  private readonly pollIntervalMs: number;
  private running = false;
  private currentJob: ZRWebhookJob | null = null;
  private readonly orchestrator = new TrackingOrchestrator();

  constructor(private readonly config: PushWorkerConfig) {
    this.pollIntervalMs = Math.max(
      1000,
      config.zrExpressWebhookPollIntervalMs || DEFAULT_POLL_INTERVAL_MS
    );
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseSecretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log(`[ZRExpressWebhookWorker]: Started (worker ${this.workerId}, poll ${this.pollIntervalMs}ms).`);

    while (this.running) {
      try {
        const job = await this.claimNext();
        if (!job) {
          await this.sleep(this.pollIntervalMs);
          continue;
        }
        this.currentJob = job;
        await this.process(job);
        this.currentJob = null;
      } catch (error: any) {
        console.error('[ZRExpressWebhookWorker]: Main loop error:', error?.message || error);
        if (this.running) await this.sleep(this.pollIntervalMs);
      }
    }

    console.log('[ZRExpressWebhookWorker]: Stopped.');
  }

  async stop(): Promise<void> {
    this.running = false;
    // The current event is deliberately left leased when it is already being
    // processed. A replacement instance reclaims it if the lease expires.
    // Releasing it immediately could cause a second replica to process it
    // while the first instance is still completing a database operation.
  }

  private async claimNext(): Promise<ZRWebhookJob | null> {
    const { data, error } = await this.supabase.rpc('claim_next_zrexpress_webhook_event', {
      p_worker_id: this.workerId,
      p_lease_seconds: 90,
    });
    if (error) {
      console.error('[ZRExpressWebhookWorker]: Could not claim queued event:', error.message);
      await this.sleep(Math.max(this.pollIntervalMs, 5000));
      return null;
    }
    return (data?.[0] as ZRWebhookJob | undefined) || null;
  }

  private async process(job: ZRWebhookJob): Promise<void> {
    const startedAt = Date.now();
    try {
      if (!job.payload || job.payload.eventType !== job.event_type) {
        throw new Error('Queued ZR Express event envelope is inconsistent.');
      }
      if (Date.parse(job.payload.occurredAt) !== Date.parse(job.occurred_at)) {
        throw new Error('Queued ZR Express event timestamp is inconsistent.');
      }

      const event = ZRExpressWebhookAdapter.normalize(
        job.merchant_id,
        job.payload,
        job.svix_id
      );
      const result = await this.orchestrator.processEvent(event, {
        siteUrl: this.config.trackingPublicBaseUrl,
      });

      if (!result.success) {
        const errorText = typeof result.error === 'string'
          ? result.error
          : result.message || 'TajerTrack could not process the ZR Express event.';
        throw new Error(errorText);
      }

      if (result.isNewOrder && result.orderId) {
        try {
          await this.enqueueOrderConfirmation(job.merchant_id, result.orderId, event.customerPhone);
        } catch (error: any) {
          // Keep shipment tracking successful; Telegram confirmation is a
          // separate notification and must never block the carrier event.
          console.warn('[ZRExpressWebhookWorker]: Confirmation enqueue failed:', error?.message || error);
        }
      }

      const now = new Date().toISOString();
      const { error: completeError } = await this.supabase
        .from('zrexpress_webhook_events')
        .update({
          status: 'completed',
          processed_at: now,
          last_error: null,
          locked_by: null,
          locked_at: null,
          lease_expires_at: null,
          updated_at: now,
        })
        .eq('id', job.id);

      if (completeError) throw completeError;

      await this.supabase
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
        .eq('provider', 'zrexpress');

      console.log(
        `[ZRExpressWebhookWorker]: Processed ${job.event_type} (${job.svix_id.slice(0, 10)}) in ${Date.now() - startedAt}ms; new order: ${Boolean(result.isNewOrder)}; deduplicated: ${Boolean(result.deduplicated)}.`
      );
    } catch (error: any) {
      await this.failOrRetry(job, error);
    }
  }

  private async enqueueOrderConfirmation(
    merchantId: string,
    orderId: string,
    customerPhone?: string
  ): Promise<void> {
    if (!customerPhone?.trim()) return;

    const { data: merchant, error: merchantError } = await this.supabase
      .from('merchants')
      .select('confirmation_telegram_enabled, subscription_tier, subscription_status')
      .eq('id', merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;

    const isPaidActivePlan =
      (merchant?.subscription_tier || 'starter') !== 'starter' &&
      merchant?.subscription_status === 'active';
    if (!isPaidActivePlan || !merchant?.confirmation_telegram_enabled) return;

    const { error: enqueueError } = await this.supabase
      .from('order_confirmation_outbox')
      .insert({
        order_id: orderId,
        merchant_id: merchantId,
        idempotency_key: `confirm:${merchantId}:${orderId}`,
      });

    if (enqueueError && enqueueError.code !== '23505') throw enqueueError;

    const { error: statusError } = await this.supabase
      .from('orders')
      .update({ confirmation_status: 'pending' } as any)
      .eq('id', orderId)
      .is('confirmation_status', null);
    if (statusError) throw statusError;
  }

  private async failOrRetry(job: ZRWebhookJob, error: unknown): Promise<void> {
    const rawMessage = String((error as any)?.message || 'Unknown ZR Express processing error');
    const message = rawMessage.slice(0, 500);
    const permanent = job.attempt_count >= job.max_attempts;
    const delaySeconds = RETRY_DELAYS_SECONDS[
      Math.min(Math.max(job.attempt_count - 1, 0), RETRY_DELAYS_SECONDS.length - 1)
    ];
    const now = new Date();
    const { error: updateError } = await this.supabase
      .from('zrexpress_webhook_events')
      .update({
        status: permanent ? 'dead_letter' : 'retry',
        available_at: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
        last_error: message,
        locked_by: null,
        locked_at: null,
        lease_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', job.id);

    await this.supabase
      .from('merchant_carrier_integrations')
      .update({
        last_sync_at: now.toISOString(),
        last_error: message,
        last_error_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('merchant_id', job.merchant_id)
      .eq('provider', 'zrexpress');

    if (updateError) {
      console.error('[ZRExpressWebhookWorker]: Could not persist failure state:', updateError.message);
    }
    console.error(
      `[ZRExpressWebhookWorker]: ${permanent ? 'Dead-lettered' : 'Scheduled retry for'} event ${job.svix_id.slice(0, 10)} (attempt ${job.attempt_count}/${job.max_attempts}): ${message}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
