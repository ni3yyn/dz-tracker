import crypto from 'node:crypto';
import { WorkerConfig } from './config.js';
import { TelegramSender } from './telegram-client.js';
import { TelegramQueueManager } from './queue.js';
import { WorkerHealthMonitor } from './health.js';
import { OutboxJob } from './delivery-state.js';
import { normalizePhoneForTelegram } from './phone.js';
import { renderTrackingMessage } from './message-template.js';
import { classifyTelegramError, ClassifiedError } from './error-classifier.js';

const RETRY_DELAYS_SECONDS = [60, 300, 900, 1800]; // 1m, 5m, 15m, 30m

export class TelegramTrackingWorker {
  private isRunning = false;
  constructor(
    private readonly config: WorkerConfig,
    private readonly queue: TelegramQueueManager,
    private readonly sender: TelegramSender,
    private readonly health: WorkerHealthMonitor,
    private readonly onFatalAuth: (error: ClassifiedError) => void = () => {}
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[TelegramWorker]: Starting worker loop (ID: ${this.config.workerId})...`);

    // Keep active delivery responsive, but slow the claim loop while idle.
    let idlePollDelayMs = this.config.pollIntervalMs;
    const maxIdlePollDelayMs = Math.max(this.config.pollIntervalMs, 15_000);

    while (this.isRunning) {
      try {
        // The process-wide lease is acquired before Telegram authentication in main.ts.
        // The database RPC also verifies this unique instance token before returning work.
        const job = await this.queue.claimNextJob(
          this.config.instanceId,
          this.config.leaseDurationSeconds
        );

        if (!job) {
          // Queue is empty or paused. The 15-second cap bounds new-order delay.
          await this.sleep(idlePollDelayMs);
          idlePollDelayMs = Math.min(maxIdlePollDelayMs, idlePollDelayMs * 2);
          continue;
        }

        idlePollDelayMs = this.config.pollIntervalMs;
        // 3. Process the claimed tracking job
        await this.processJob(job);
      } catch (err: any) {
        console.error('[TelegramWorker]: Unexpected error in main loop:', err?.message || err);
        const retryDelayMs = idlePollDelayMs;
        idlePollDelayMs = Math.min(maxIdlePollDelayMs, Math.max(this.config.pollIntervalMs, idlePollDelayMs * 2));
        await this.sleep(retryDelayMs);
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

    // Step B: Recheck the merchant's Telegram tracking setting
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

    // Step D: Reserve a distinct global slot before making the Telegram request.
    try {
      await this.enforceResolutionThrottle();
    } catch (err: any) {
      await this.handleRetry(
        job,
        'PHONE_SLOT_RESERVATION_FAILED',
        err?.message || 'Could not reserve a Telegram phone-resolution slot.'
      );
      return;
    }

    // Step E: Resolve Phone via Telegram MTProto contacts.resolvePhone
    const resStartTime = Date.now();
    let recipient;
    try {
      recipient = await this.sender.resolvePhone(normalizedPhone);
    } catch (err: any) {
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
        console.error('[TelegramWorker]: FATAL Telegram authorization error. Halting all MTProto work.');
        this.stop();
        this.onFatalAuth(classified);
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
      const classified = classifyTelegramError([sendResult.errorCode, sendResult.errorMessage].filter(Boolean).join(' '));

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
      } else if (classified.category === 'fatal_auth') {
        console.error('[TelegramWorker]: FATAL Telegram authorization error returned while sending. Halting all MTProto work.');
        this.stop();
        this.onFatalAuth(classified);
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
    await this.queue.reservePhoneResolutionSlot(this.config.minResolutionIntervalMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
