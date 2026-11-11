import { PushWorkerConfig } from './config.js';
import { PushQueueManager } from './queue.js';
import { WebPushClient } from './web-push-client.js';
import { PushWorkerHealthMonitor } from './health.js';
import { PushOutboxJob } from './delivery-state.js';
import { renderPushNotificationPayload } from './message-template.js';

const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600]; // 1m, 5m, 15m, 1h

export class WebPushWorker {
  private isRunning = false;
  private currentJob: PushOutboxJob | null = null;
  private readonly lostLeaseJobIds = new Set<string>();

  constructor(
    private readonly config: PushWorkerConfig,
    private readonly queue: PushQueueManager,
    private readonly pushClient: WebPushClient,
    private readonly health: PushWorkerHealthMonitor
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[WebPushWorker]: Starting worker loop (ID: ${this.config.workerId})...`);

    // Ensure worker state is enabled in DB
    await this.queue.setWorkerEnabled(true);

    while (this.isRunning) {
      try {
        // 1. Maintain worker heartbeat / lease in DB
        await this.queue.updateHeartbeat(
          this.config.instanceId,
          this.config.leaseDurationSeconds
        );
        this.health.setLeaseStatus(true);

        // 2. Claim next available job atomically (SKIP LOCKED)
        const job = await this.queue.claimNextJob(
          this.config.instanceId,
          this.config.leaseDurationSeconds
        );

        if (!job) {
          // Queue is empty or paused
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        this.currentJob = job;
        let renewalInFlight: Promise<boolean> | null = null;
        const renewalIntervalMs = Math.max(
          1000,
          Math.floor((this.config.leaseDurationSeconds * 1000) / 3)
        );
        const renewalTimer = setInterval(() => {
          if (renewalInFlight) return;
          renewalInFlight = this.renewJobLease(job.id)
            .finally(() => { renewalInFlight = null; });
        }, renewalIntervalMs);

        try {
          await this.processJob(job);
        } finally {
          clearInterval(renewalTimer);
          if (renewalInFlight) await renewalInFlight;
          this.lostLeaseJobIds.delete(job.id);
          this.currentJob = null;
        }
      } catch (err: any) {
        console.error('[WebPushWorker]: Unexpected error in main loop:', err?.message || err);
        await this.sleep(this.config.pollIntervalMs);
      }
    }

    console.log('[WebPushWorker]: Worker loop stopped.');
  }

  async stop(): Promise<void> {
    console.log('[WebPushWorker]: Signal received. Stopping after the in-flight job finishes...');
    // Do not release a job while processJob may still be sending it. The main
    // shutdown path awaits the worker loop; the job is then committed or its
    // lease expires naturally if the process is terminated unexpectedly.
    this.isRunning = false;
  }

  private async processJob(job: PushOutboxJob): Promise<void> {
    const startTime = Date.now();
    console.log(
      `[WebPushWorker]: Processing job ${job.id} for history ${job.order_history_id} (Attempt ${job.attempt_count}/${job.max_attempts})`
    );

    // Step A: Load full context (order_history, order_push_subscription, web_push_subscription, order, merchant)
    const ctx = await this.queue.fetchJobContext(
      job.order_history_id,
      job.order_push_subscription_id
    );

    if (!ctx) {
      console.warn(`[WebPushWorker]: Context missing for job ${job.id}`);
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'push_send',
        outcome: 'failed',
        errorCode: 'CONTEXT_NOT_FOUND',
        errorMessage: 'Associated order, subscription, or history not found',
        durationMs: Date.now() - startTime,
      });

      await this.queue.updateJob(job.id, {
        status: 'failed',
        resultCode: 'context_not_found',
        errorCode: 'CONTEXT_NOT_FOUND',
      });

      this.health.recordJobProcessed('failed');
      return;
    }

    // Step B: Check if shipment notification was revoked by customer
    if (ctx.orderPushSubscription.revokedAt) {
      console.log(`[WebPushWorker]: Subscription revoked for order ${ctx.order.id}. Skipping.`);
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'push_send',
        outcome: 'cancelled',
        errorCode: 'SUBSCRIPTION_REVOKED',
        errorMessage: 'Customer revoked notifications for this shipment',
        durationMs: Date.now() - startTime,
      });

      await this.queue.updateJob(job.id, {
        status: 'cancelled',
        resultCode: 'subscription_revoked',
      });

      return;
    }

    // Step C: Check if device push subscription is active
    if (ctx.deviceSubscription.status !== 'active') {
      console.log(`[WebPushWorker]: Device subscription is not active (${ctx.deviceSubscription.status}). Cancelling.`);
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'push_send',
        outcome: 'cancelled',
        errorCode: 'DEVICE_NOT_ACTIVE',
        errorMessage: `Device subscription status is ${ctx.deviceSubscription.status}`,
        durationMs: Date.now() - startTime,
      });

      await this.queue.updateJob(job.id, {
        status: 'cancelled',
        resultCode: 'device_inactive',
      });

      return;
    }

    // Step D: Render push notification payload
    const payload = renderPushNotificationPayload({
      storeName: ctx.merchant?.storeName,
      statusTitle: ctx.orderHistory.statusTitle,
      description: ctx.orderHistory.description,
      trackingUuid: ctx.order.trackingUuid,
      orderHistoryId: ctx.orderHistory.id,
    });

    // Confirm ownership immediately before the external side effect.
    if (!(await this.renewJobLease(job.id))) {
      console.warn(`[WebPushWorker]: Skipping send for job ${job.id}; its lease is no longer owned by this process.`);
      return;
    }

    // Step E: Send Push Notification via VAPID Web Push
    const result = await this.pushClient.sendPush(
      {
        endpoint: ctx.deviceSubscription.endpoint,
        p256dh: ctx.deviceSubscription.p256dh,
        auth_secret: ctx.deviceSubscription.authSecret,
      },
      payload,
      {
        topic: ctx.order.trackingUuid,
      }
    );

    const durationMs = Date.now() - startTime;

    // A response from a stale worker must not alter subscription state or job state.
    if (!(await this.renewJobLease(job.id))) {
      console.warn(`[WebPushWorker]: Ignoring result for job ${job.id}; its lease was taken over by another worker.`);
      return;
    }

    // Step F: Handle Result
    if (result.success) {
      console.log(`[WebPushWorker]: Push delivered successfully for job ${job.id}`);
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'push_send',
        outcome: 'success',
        responseStatus: result.statusCode,
        durationMs,
      });

      await this.queue.updateJob(job.id, {
        status: 'sent',
        resultCode: 'sent_201',
        sentAt: new Date().toISOString(),
      });

      await this.queue.recordSubscriptionSuccess(ctx.deviceSubscription.id);
      this.health.recordJobProcessed('sent');
      return;
    }

    // 1. Subscription Expired / 404 / 410 Gone
    if (result.isExpiredSubscription) {
      console.warn(`[WebPushWorker]: Subscription expired (410/404) for device ${ctx.deviceSubscription.id}. Deactivating.`);
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'subscription_cleanup',
        outcome: 'expired_subscription',
        responseStatus: result.statusCode,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        durationMs,
      });

      await this.queue.deactivateSubscription(
        ctx.deviceSubscription.id,
        result.errorCode || 'SUBSCRIPTION_EXPIRED'
      );

      await this.queue.updateJob(job.id, {
        status: 'failed',
        resultCode: 'subscription_expired',
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      this.health.recordJobProcessed('expired');
      return;
    }

    // 2. Retryable Error (429 Rate Limited or 5xx/Network)
    if (result.isRetryable) {
      console.warn(`[WebPushWorker]: Retryable push error for job ${job.id}: ${result.errorCode} - ${result.errorMessage}`);
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'push_send',
        outcome: 'retryable_failure',
        responseStatus: result.statusCode,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        durationMs,
      });

      // Pause worker if rate limited
      if (result.statusCode === 429 && result.retryAfterSeconds) {
        await this.queue.pauseWorkerUntil(
          new Date(Date.now() + result.retryAfterSeconds * 1000)
        );
      }

      if (job.attempt_count >= job.max_attempts) {
        console.error(`[WebPushWorker]: Job ${job.id} exceeded max retries (${job.max_attempts}). Marking as failed.`);
        await this.queue.updateJob(job.id, {
          status: 'failed',
          resultCode: 'max_retries_exceeded',
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
        this.health.recordJobProcessed('failed');
      } else {
        const delayIdx = Math.min(job.attempt_count - 1, RETRY_DELAYS_SECONDS.length - 1);
        const delaySec = result.retryAfterSeconds || RETRY_DELAYS_SECONDS[Math.max(0, delayIdx)];
        const nextAvailable = new Date(Date.now() + delaySec * 1000).toISOString();

        console.log(`[WebPushWorker]: Rescheduling job ${job.id} for retry in ${delaySec}s (${nextAvailable})`);
        await this.queue.updateJob(job.id, {
          status: 'retry',
          resultCode: 'scheduled_retry',
          availableAt: nextAvailable,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      }
      return;
    }

    // 3. Fatal Client / VAPID Error (400, 401, 403)
    console.error(`[WebPushWorker]: Fatal client error for job ${job.id}: ${result.errorCode} - ${result.errorMessage}`);
    await this.queue.recordAttempt({
      jobId: job.id,
      attemptNumber: job.attempt_count,
      operation: 'push_send',
      outcome: 'fatal_client_error',
      responseStatus: result.statusCode,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      durationMs,
    });

    await this.queue.updateJob(job.id, {
      status: 'failed',
      resultCode: 'fatal_client_error',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });

    this.health.recordJobProcessed('failed');
  }

  private async renewJobLease(jobId: string): Promise<boolean> {
    const renewed = await this.queue.renewJobLease(jobId, this.config.leaseDurationSeconds);
    if (renewed) {
      this.lostLeaseJobIds.delete(jobId);
    } else {
      this.lostLeaseJobIds.add(jobId);
    }
    return renewed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

