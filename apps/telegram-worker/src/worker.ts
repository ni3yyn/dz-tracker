import crypto from 'node:crypto';
import { WorkerConfig } from './config.js';
import { TelegramSender } from './telegram-client.js';
import { TelegramQueueManager } from './queue.js';
import { WorkerHealthMonitor } from './health.js';
import { OutboxJob } from './delivery-state.js';
import { normalizePhoneForTelegram } from './phone.js';
import { renderTrackingMessage } from './message-template.js';
import { classifyTelegramError } from './error-classifier.js';

const RETRY_DELAYS_SECONDS = [60, 300, 900, 1800]; // 1m, 5m, 15m, 30m

export class TelegramTrackingWorker {
  private isRunning = false;
  private lastResolutionTime = 0;

  constructor(
    private readonly config: WorkerConfig,
    private readonly queue: TelegramQueueManager,
    private readonly sender: TelegramSender,
    private readonly health: WorkerHealthMonitor
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[TelegramWorker]: Starting worker loop (ID: ${this.config.workerId})...`);

    while (this.isRunning) {
      try {
        // 1. Maintain or acquire worker lease
        const leaseAcquired = await this.queue.acquireLease(
          this.config.workerId,
          this.config.leaseDurationSeconds
        );
        this.health.setLeaseStatus(leaseAcquired);

        if (!leaseAcquired) {
          console.log('[TelegramWorker]: Another worker holds the active lease. Sleeping...');
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        // 2. Claim next available job atomically (FOR UPDATE SKIP LOCKED)
        const job = await this.queue.claimNextJob(
          this.config.workerId,
          this.config.leaseDurationSeconds
        );

        if (!job) {
          // Queue is empty or paused
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        // 3. Process the claimed tracking job
        await this.processJob(job);
      } catch (err: any) {
        console.error('[TelegramWorker]: Unexpected error in main loop:', err?.message || err);
        await this.sleep(this.config.pollIntervalMs);
      }
    }

    console.log('[TelegramWorker]: Worker loop stopped.');
  }

  stop(): void {
    console.log('[TelegramWorker]: Signal received. Shutting down worker gracefully...');
    this.isRunning = false;
  }

  private async processJob(job: OutboxJob): Promise<void> {
    const startTime = Date.now();
    console.log(`[TelegramWorker]: Processing job ${job.id} for order ${job.order_id} (Attempt ${job.attempt_count}/${job.max_attempts})`);

    // Step A: Load Order and associated Merchant
    const orderData = await this.queue.fetchOrderDetails(job.order_id);
    if (!orderData) {
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'session_check',
        outcome: 'failed',
        errorCode: 'ORDER_NOT_FOUND',
        errorMessage: 'Associated order could not be located in database',
        durationMs: Date.now() - startTime,
      });
      await this.queue.updateJob(job.id, {
        status: 'skipped',
        resultCode: 'order_not_found',
      });
      this.health.recordJobProcessed('skipped');
      return;
    }

    // Step B: Recheck merchant toggle and consent
    if (!orderData.merchant?.telegram_tracking_link_enabled) {
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'session_check',
        outcome: 'skipped',
        errorCode: 'MERCHANT_DISABLED',
        errorMessage: 'Merchant has disabled automatic Telegram tracking link delivery',
        durationMs: Date.now() - startTime,
      });
      await this.queue.updateJob(job.id, {
        status: 'skipped',
        resultCode: 'merchant_disabled',
      });
      this.health.recordJobProcessed('skipped');
      return;
    }

    if (!orderData.telegram_consent_at) {
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'session_check',
        outcome: 'skipped',
        errorCode: 'CONSENT_MISSING',
        errorMessage: 'Order has no explicit Telegram notification consent timestamp',
        durationMs: Date.now() - startTime,
      });
      await this.queue.updateJob(job.id, {
        status: 'skipped',
        resultCode: 'consent_missing',
      });
      this.health.recordJobProcessed('skipped');
      return;
    }

    // Step C: Validate and Normalize Customer Phone Number
    const normalizedPhone = normalizePhoneForTelegram(orderData.customer_phone);
    if (!normalizedPhone) {
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'phone_resolution',
        outcome: 'skipped',
        errorCode: 'INVALID_PHONE',
        errorMessage: `Customer phone (${orderData.customer_phone}) is missing or malformed`,
        durationMs: Date.now() - startTime,
      });
      await this.queue.updateJob(job.id, {
        status: 'skipped',
        resultCode: 'invalid_phone',
        errorCode: 'INVALID_PHONE',
      });
      this.health.recordJobProcessed('skipped');
      return;
    }

    // Step D: Enforce Global Phone Resolution Rate Limiter (3.5s minimum interval)
    await this.enforceResolutionThrottle();

    // Step E: Resolve Phone via Telegram MTProto contacts.resolvePhone
    const resStartTime = Date.now();
    let recipient;
    try {
      recipient = await this.sender.resolvePhone(normalizedPhone);
      this.lastResolutionTime = Date.now();
    } catch (err: any) {
      this.lastResolutionTime = Date.now();
      const classified = classifyTelegramError(err);

      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'phone_resolution',
        outcome: classified.category === 'flood_wait' ? 'flood_wait' : 'failed',
        errorCode: classified.code,
        errorMessage: classified.message,
        durationMs: Date.now() - resStartTime,
      });

      if (classified.category === 'flood_wait') {
        const pauseUntil = new Date(Date.now() + (classified.floodWaitSeconds || 60) * 1000);
        console.warn(`[TelegramWorker]: FLOOD_WAIT triggered. Pausing queue until ${pauseUntil.toISOString()}`);
        await this.queue.pauseWorkerUntil(pauseUntil);
        await this.handleRetry(job, classified.code, classified.message);
        return;
      }

      if (classified.category === 'fatal_auth') {
        console.error('[TelegramWorker]: FATAL: Session revoked. Stopping worker loop.');
        this.stop();
        return;
      }

      // Retryable network or server failure
      await this.handleRetry(job, classified.code, classified.message);
      return;
    }

    if (!recipient) {
      // Permanent: Phone not registered on Telegram or privacy settings prohibit resolution
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'phone_resolution',
        outcome: 'not_resolvable',
        errorCode: 'NOT_RESOLVABLE',
        errorMessage: 'Telegram returned no user identity for this phone number',
        durationMs: Date.now() - resStartTime,
      });
      await this.queue.updateJob(job.id, {
        status: 'skipped',
        resultCode: 'not_resolvable',
      });
      this.health.recordJobProcessed('skipped');
      return;
    }

    // Record successful resolution
    await this.queue.recordAttempt({
      jobId: job.id,
      attemptNumber: job.attempt_count,
      operation: 'phone_resolution',
      outcome: 'success',
      durationMs: Date.now() - resStartTime,
    });

    // Step F: Obtain / Reuse Cryptographically Secure Random ID for MTProto Deduplication
    let randomId: bigint;
    if (job.telegram_random_id) {
      randomId = BigInt(job.telegram_random_id);
    } else {
      // 64-bit safe positive random integer
      const buffer = crypto.randomBytes(8);
      buffer[0] &= 0x7f; // ensure positive
      randomId = buffer.readBigInt64BE(0);
      await this.queue.updateJob(job.id, { randomId });
    }

    // Step G: Render Canonical Tracking Message
    const canonicalUrl = `${this.config.trackingPublicBaseUrl}/t/${orderData.tracking_uuid}`;
    const message = renderTrackingMessage({
      customerName: orderData.customer_name,
      storeName: orderData.merchant?.store_name,
      orderNumber: orderData.external_order_id,
      trackingUrl: canonicalUrl,
    });

    // Step H: Send Tracking Link via Telegram MTProto
    const sendStartTime = Date.now();
    const sendResult = await this.sender.sendTrackingLink(recipient, message, randomId);

    if (sendResult.success) {
      const nowIso = new Date().toISOString();
      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'message_send',
        outcome: 'sent',
        durationMs: Date.now() - sendStartTime,
      });

      await this.queue.updateJob(job.id, {
        status: 'sent',
        resultCode: 'delivered',
        sentAt: nowIso,
        telegramUserId: recipient.userId,
        telegramMessageId: sendResult.messageId,
      });

      this.health.recordJobProcessed('sent');
      console.log(`[TelegramWorker]: Successfully delivered tracking link for order ${orderData.external_order_id}`);
    } else {
      const classified = classifyTelegramError(sendResult.errorMessage || sendResult.errorCode);

      await this.queue.recordAttempt({
        jobId: job.id,
        attemptNumber: job.attempt_count,
        operation: 'message_send',
        outcome: 'failed',
        errorCode: sendResult.errorCode || classified.code,
        errorMessage: sendResult.errorMessage || classified.message,
        durationMs: Date.now() - sendStartTime,
      });

      if (classified.category === 'skip_permanent') {
        await this.queue.updateJob(job.id, {
          status: 'skipped',
          resultCode: sendResult.errorCode || 'restricted',
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
        });
        this.health.recordJobProcessed('skipped');
      } else {
        await this.handleRetry(job, sendResult.errorCode, sendResult.errorMessage);
      }
    }
  }

  private async handleRetry(job: OutboxJob, errorCode?: string, errorMessage?: string): Promise<void> {
    if (job.attempt_count >= job.max_attempts) {
      console.warn(`[TelegramWorker]: Job ${job.id} exhausted max attempts (${job.max_attempts}). Moving to dead_letter.`);
      await this.queue.updateJob(job.id, {
        status: 'dead_letter',
        errorCode: errorCode || 'MAX_ATTEMPTS_EXHAUSTED',
        errorMessage: errorMessage || 'Maximum retry attempts exceeded',
      });
      this.health.recordJobProcessed('failed');
      return;
    }

    const delayIndex = Math.min(job.attempt_count - 1, RETRY_DELAYS_SECONDS.length - 1);
    const delaySeconds = RETRY_DELAYS_SECONDS[Math.max(0, delayIndex)];
    const nextAvailableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

    console.log(`[TelegramWorker]: Scheduling retry for job ${job.id} at ${nextAvailableAt} (in ${delaySeconds}s)`);

    await this.queue.updateJob(job.id, {
      status: 'retry',
      errorCode,
      errorMessage,
      availableAt: nextAvailableAt,
    });
    this.health.recordJobProcessed('failed');
  }

  private async enforceResolutionThrottle(): Promise<void> {
    const elapsed = Date.now() - this.lastResolutionTime;
    if (elapsed < this.config.minResolutionIntervalMs) {
      const waitMs = this.config.minResolutionIntervalMs - elapsed;
      await this.sleep(waitMs);
    }
    // Coordinate globally across workers via database singleton state
    await this.queue.reservePhoneResolutionSlot(this.config.minResolutionIntervalMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
