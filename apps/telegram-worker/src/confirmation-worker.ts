import crypto from 'node:crypto';
import { WorkerConfig } from './config.js';
import { TelegramSender } from './telegram-client.js';
import { TelegramQueueManager } from './queue.js';
import { ConfirmationJob } from './delivery-state.js';
import { normalizePhoneForTelegram } from './phone.js';
import { renderConfirmationMessage } from './confirmation-template.js';
import { classifyTelegramError } from './error-classifier.js';

const RETRY_DELAYS_SECONDS = [120, 600, 1800, 3600]; // 2m, 10m, 30m, 1h
const CONFIRMATION_EXPIRY_HOURS = 24;

/**
 * Checks if a merchant has an active paid plan (not starter).
 * Confirmation is only sent for basic, growth, or scale tiers.
 */
function isPaidPlan(subscriptionTier?: string, subscriptionStatus?: string): boolean {
  if (!subscriptionTier || subscriptionTier === 'starter') return false;
  return subscriptionStatus === 'active';
}

export class TelegramConfirmationWorker {
  private isRunning = false;
  private lastResolutionTime = 0;

  constructor(
    private readonly config: WorkerConfig,
    private readonly queue: TelegramQueueManager,
    private readonly sender: TelegramSender
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[ConfirmationWorker]: Starting confirmation loop (ID: ${this.config.workerId})...`);

    while (this.isRunning) {
      try {
        const job = await this.queue.claimNextConfirmationJob(
          this.config.workerId,
          this.config.leaseDurationSeconds
        );

        if (!job) {
          await this.sleep(this.config.pollIntervalMs);
          continue;
        }

        await this.processJob(job);
      } catch (err: any) {
        console.error('[ConfirmationWorker]: Unexpected error in main loop:', err?.message || err);
        await this.sleep(this.config.pollIntervalMs);
      }
    }

    console.log('[ConfirmationWorker]: Loop stopped.');
  }

  stop(): void {
    this.isRunning = false;
  }

  private async processJob(job: ConfirmationJob): Promise<void> {
    const startTime = Date.now();
    console.log(`[ConfirmationWorker]: Processing job ${job.id} for order ${job.order_id}`);

    // Load order + merchant
    const orderData = await this.queue.fetchOrderForConfirmation(job.order_id);
    if (!orderData) {
      await this.queue.updateConfirmationJob(job.id, {
        status: 'skipped',
        resultCode: 'order_not_found',
      });
      return;
    }

    // Guard: paid plan check (double-check in worker, not just UI)
    const tier = orderData.merchant?.subscription_tier;
    const status = orderData.merchant?.subscription_status;
    if (!isPaidPlan(tier, status)) {
      console.log(`[ConfirmationWorker]: Merchant on free plan (${tier}), skipping confirmation.`);
      await this.queue.updateConfirmationJob(job.id, {
        status: 'skipped',
        resultCode: 'free_plan',
      });
      return;
    }

    // Guard: merchant toggle
    if (!orderData.merchant?.confirmation_telegram_enabled) {
      await this.queue.updateConfirmationJob(job.id, {
        status: 'skipped',
        resultCode: 'merchant_disabled',
      });
      return;
    }

    // Normalize phone
    const normalizedPhone = normalizePhoneForTelegram(orderData.customer_phone);
    if (!normalizedPhone) {
      await this.queue.updateConfirmationJob(job.id, {
        status: 'skipped',
        resultCode: 'invalid_phone',
        errorCode: 'INVALID_PHONE',
      });
      return;
    }

    // Rate limit phone resolution (shared with tracking worker)
    await this.enforceResolutionThrottle();

    // Resolve phone via MTProto
    let recipient;
    try {
      recipient = await this.sender.resolvePhone(normalizedPhone);
      this.lastResolutionTime = Date.now();
    } catch (err: any) {
      this.lastResolutionTime = Date.now();
      const classified = classifyTelegramError(err);

      if (classified.category === 'flood_wait') {
        const pauseUntil = new Date(Date.now() + (classified.floodWaitSeconds || 60) * 1000);
        await this.queue.pauseWorkerUntil(pauseUntil);
        await this.handleRetry(job, classified.code, classified.message);
        return;
      }

      await this.handleRetry(job, classified.code, classified.message);
      return;
    }

    if (!recipient) {
      await this.queue.updateConfirmationJob(job.id, {
        status: 'skipped',
        resultCode: 'not_resolvable',
      });
      return;
    }

    // Generate or reuse random ID for MTProto dedup
    let randomId: bigint;
    if (job.telegram_random_id) {
      randomId = BigInt(job.telegram_random_id);
    } else {
      const buffer = crypto.randomBytes(8);
      buffer[0] &= 0x7f;
      randomId = buffer.readBigInt64BE(0);
      await this.queue.updateConfirmationJob(job.id, { randomId });
    }

    // Build secure token + confirmation URL
    const token = this.generateConfirmationToken(job.order_id);
    const expiresAt = new Date(Date.now() + CONFIRMATION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    const confirmationUrl = `${this.config.trackingPublicBaseUrl}/confirm/${token}`;

    // Persist the token to the order so the web route can verify it
    await this.saveConfirmationToken(job.order_id, token, expiresAt);

    // Render + send message
    const message = renderConfirmationMessage({
      customerName: orderData.customer_name,
      storeName: orderData.merchant?.store_name,
      orderNumber: orderData.external_order_id,
      confirmationUrl,
      expiresInHours: CONFIRMATION_EXPIRY_HOURS,
    });

    const sendResult = await this.sender.sendTrackingLink(recipient, message, randomId);

    if (sendResult.success) {
      await this.queue.updateConfirmationJob(job.id, {
        status: 'sent',
        resultCode: 'delivered',
        sentAt: new Date().toISOString(),
        telegramUserId: recipient.userId,
        telegramMessageId: sendResult.messageId,
      });
      console.log(`[ConfirmationWorker]: Sent confirmation request for order ${orderData.external_order_id}`);
    } else {
      const classified = classifyTelegramError(sendResult.errorMessage || sendResult.errorCode);

      if (classified.category === 'skip_permanent') {
        await this.queue.updateConfirmationJob(job.id, {
          status: 'skipped',
          resultCode: sendResult.errorCode || 'restricted',
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
        });
      } else {
        await this.handleRetry(job, sendResult.errorCode, sendResult.errorMessage);
      }
    }
  }

  private generateConfirmationToken(orderId: string): string {
    // HMAC-SHA256 of orderId + secret + timestamp — single-use safe token
    const secret = process.env.CONFIRMATION_TOKEN_SECRET || process.env.SUPABASE_SECRET_KEY || 'fallback-secret';
    const ts = Date.now().toString(36);
    const mac = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}:${ts}`)
      .digest('hex')
      .slice(0, 32);
    return `${ts}-${mac}`;
  }

  private async saveConfirmationToken(orderId: string, token: string, expiresAt: string): Promise<void> {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    await supabase
      .from('orders')
      .update({
        confirmation_status: 'pending',
        confirmation_token: token,
        confirmation_expires_at: expiresAt,
        confirmation_sent_at: new Date().toISOString(),
      } as any)
      .eq('id', orderId);
  }

  private async handleRetry(job: ConfirmationJob, errorCode?: string, errorMessage?: string): Promise<void> {
    if (job.attempt_count >= job.max_attempts) {
      await this.queue.updateConfirmationJob(job.id, {
        status: 'dead_letter',
        errorCode: errorCode || 'MAX_ATTEMPTS_EXHAUSTED',
        errorMessage: errorMessage || 'Maximum retry attempts exceeded',
      });
      return;
    }

    const delayIndex = Math.min(job.attempt_count - 1, RETRY_DELAYS_SECONDS.length - 1);
    const delaySeconds = RETRY_DELAYS_SECONDS[Math.max(0, delayIndex)];
    const nextAvailableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

    await this.queue.updateConfirmationJob(job.id, {
      status: 'retry',
      errorCode,
      errorMessage,
      availableAt: nextAvailableAt,
    });
  }

  private async enforceResolutionThrottle(): Promise<void> {
    const elapsed = Date.now() - this.lastResolutionTime;
    if (elapsed < this.config.minResolutionIntervalMs) {
      await this.sleep(this.config.minResolutionIntervalMs - elapsed);
    }
    await this.queue.reservePhoneResolutionSlot(this.config.minResolutionIntervalMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

