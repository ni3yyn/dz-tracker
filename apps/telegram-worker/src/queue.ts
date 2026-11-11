import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@saas/database';
import { WorkerConfig } from './config.js';
import { OutboxJob, OutboxStatus, AttemptOperation, ConfirmationJob } from './delivery-state.js';

export interface OrderWithMerchant {
  id: string;
  merchant_id: string;
  external_order_id: string;
  customer_phone: string | null;
  customer_name: string | null;
  tracking_uuid: string;
  merchant: {
    id: string;
    store_name: string;
    telegram_tracking_link_enabled: boolean;
    confirmation_telegram_enabled?: boolean;
    subscription_tier?: string;
    subscription_status?: string;
  } | null;
}

export class TelegramQueueManager {
  private readonly supabase: SupabaseClient<Database>;

  constructor(private readonly config: WorkerConfig) {
    this.supabase = createClient<Database>(
      this.config.supabaseUrl,
      this.config.supabaseSecretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  async acquireLease(instanceId: string, leaseSeconds: number): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('acquire_telegram_worker_lease', {
        p_worker_id: instanceId,
        p_lease_seconds: leaseSeconds,
      });

      if (error) {
        console.error('[QueueManager]: Failed to acquire/renew process lease:', error.message);
        return false;
      }

      return data === true;
    } catch (err: any) {
      console.error('[QueueManager]: Lease acquisition request failed:', err?.message || err);
      return false;
    }
  }

  /**
   * Releases only this process's lease. The owner predicate is essential:
   * a stale process must never clear a newer process's lease.
   */
  async releaseLease(instanceId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('telegram_worker_state')
        .update({
          lease_owner: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
        .eq('lease_owner', instanceId)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('[QueueManager]: Failed to release process lease:', error.message);
        return false;
      }

      return Boolean(data);
    } catch (err: any) {
      console.error('[QueueManager]: Lease release request failed:', err?.message || err);
      return false;
    }
  }

  async claimNextJob(workerId: string, leaseSeconds: number): Promise<OutboxJob | null> {
    const { data, error } = await this.supabase.rpc('claim_next_telegram_tracking_job', {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });

    if (error) {
      console.error('[QueueManager]: Failed to claim next outbox job:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as OutboxJob;
  }

  async fetchOrderDetails(orderId: string): Promise<OrderWithMerchant | null> {
    const { data: order, error: orderErr } = await this.supabase
      .from('orders')
      .select('id, merchant_id, external_order_id, customer_phone, customer_name, tracking_uuid')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      console.warn(`[QueueManager]: Could not fetch order ${orderId}:`, orderErr?.message);
      return null;
    }

    const { data: merchant } = await this.supabase
      .from('merchants')
      .select('id, store_name, telegram_tracking_link_enabled')
      .eq('id', order.merchant_id)
      .maybeSingle();

    return {
      ...order,
      merchant: merchant
        ? {
            id: merchant.id,
            store_name: merchant.store_name,
            telegram_tracking_link_enabled: Boolean(merchant.telegram_tracking_link_enabled),
          }
        : null,
    };
  }

  async recordAttempt(params: {
    jobId: string;
    attemptNumber: number;
    operation: AttemptOperation;
    outcome: string;
    errorCode?: string;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.supabase.from('telegram_tracking_attempts').insert({
        job_id: params.jobId,
        attempt_number: params.attemptNumber,
        operation: params.operation,
        outcome: params.outcome,
        error_code: params.errorCode || null,
        error_message: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
        duration_ms: params.durationMs || null,
      });
    } catch (err: any) {
      console.warn('[QueueManager]: Error recording attempt history:', err?.message);
    }
  }

  async updateJob(
    jobId: string,
    updates: {
      status?: OutboxStatus;
      resultCode?: string;
      errorCode?: string;
      errorMessage?: string;
      randomId?: bigint;
      telegramUserId?: number;
      telegramMessageId?: number;
      availableAt?: string;
      sentAt?: string;
    }
  ): Promise<void> {
    const payload: any = {
      updated_at: new Date().toISOString(),
      locked_by: null,
      lease_expires_at: null,
    };

    if (updates.status) payload.status = updates.status;
    if (updates.resultCode) payload.result_code = updates.resultCode;
    if (updates.errorCode !== undefined) payload.last_error_code = updates.errorCode;
    if (updates.errorMessage !== undefined) {
      payload.last_error_message = updates.errorMessage ? updates.errorMessage.slice(0, 500) : null;
    }
    if (updates.randomId !== undefined) {
      payload.telegram_random_id = Number(updates.randomId);
    }
    if (updates.telegramUserId !== undefined) {
      payload.telegram_user_id = updates.telegramUserId;
    }
    if (updates.telegramMessageId !== undefined) {
      payload.telegram_message_id = updates.telegramMessageId;
    }
    if (updates.availableAt) payload.available_at = updates.availableAt;
    if (updates.sentAt) payload.sent_at = updates.sentAt;

    const { error } = await this.supabase
      .from('telegram_tracking_outbox')
      .update(payload)
      .eq('id', jobId)
      .eq('locked_by', this.config.instanceId);

    if (error) {
      console.error(`[QueueManager]: Error updating outbox job ${jobId}:`, error.message);
    }
  }

  async pauseWorkerUntil(pausedUntil: Date): Promise<void> {
    const { error } = await this.supabase.rpc('pause_telegram_worker_until', {
      p_paused_until: pausedUntil.toISOString(),
    });

    if (error) {
      // Keep the pause visible even during a partial migration rollout.
      // The slot reservation itself remains atomic once its RPC is installed.
      console.error('[QueueManager]: Atomic Telegram pause update failed:', error.message);
      await this.supabase
        .from('telegram_worker_state')
        .update({
          paused_until: pausedUntil.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
    }
  }

  async setWorkerEnabled(enabled: boolean): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('telegram_worker_state')
        .update({
          is_enabled: enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) {
        console.error('[QueueManager]: Failed to update worker is_enabled state:', error.message);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error('[QueueManager]: Worker state update failed:', err?.message || err);
      return false;
    }
  }

  /**
   * Enforces global, multi-worker persistent rate limiting for contacts.resolvePhone
   * Spaced by at least minIntervalMs (3.5s per Telegram recommendation)
   */
  /**
   * Atomically reserves a globally ordered phone-resolution slot in PostgreSQL.
   * The RPC locks the singleton worker-state row, so the tracking and
   * confirmation loops cannot reserve the same interval concurrently.
   */
  async reservePhoneResolutionSlot(minIntervalMs: number): Promise<void> {
    const { data, error } = await this.supabase.rpc('reserve_telegram_phone_resolution_slot', {
      p_min_interval_ms: minIntervalMs,
    });

    if (error) {
      throw new Error(`Could not reserve Telegram phone-resolution slot: ${error.message}`);
    }

    const slotAt = Date.parse(String(data));
    if (!Number.isFinite(slotAt)) {
      throw new Error('Telegram phone-resolution reservation returned an invalid timestamp.');
    }

    const waitMs = Math.max(0, slotAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  // ─── Confirmation Outbox ───────────────────────────────────────────────────

  async claimNextConfirmationJob(workerId: string, leaseSeconds: number): Promise<ConfirmationJob | null> {
    const { data, error } = await this.supabase.rpc('claim_next_confirmation_job', {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });

    if (error) {
      console.error('[QueueManager]: Failed to claim next confirmation job:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;
    return data[0] as ConfirmationJob;
  }

  async updateConfirmationJob(
    jobId: string,
    updates: {
      status?: ConfirmationJob['status'];
      resultCode?: string;
      errorCode?: string;
      errorMessage?: string;
      randomId?: bigint;
      telegramUserId?: number;
      telegramMessageId?: number;
      availableAt?: string;
      sentAt?: string;
    }
  ): Promise<void> {
    const payload: any = {
      updated_at: new Date().toISOString(),
      locked_by: null,
      lease_expires_at: null,
    };

    if (updates.status) payload.status = updates.status;
    if (updates.resultCode) payload.result_code = updates.resultCode;
    if (updates.errorCode !== undefined) payload.last_error_code = updates.errorCode;
    if (updates.errorMessage !== undefined) {
      payload.last_error_message = updates.errorMessage ? updates.errorMessage.slice(0, 500) : null;
    }
    if (updates.randomId !== undefined) payload.telegram_random_id = Number(updates.randomId);
    if (updates.telegramUserId !== undefined) payload.telegram_user_id = updates.telegramUserId;
    if (updates.telegramMessageId !== undefined) payload.telegram_message_id = updates.telegramMessageId;
    if (updates.availableAt) payload.available_at = updates.availableAt;
    if (updates.sentAt) payload.sent_at = updates.sentAt;

    const { error } = await this.supabase
      .from('order_confirmation_outbox')
      .update(payload)
      .eq('id', jobId)
      .eq('locked_by', this.config.instanceId);

    if (error) {
      console.error(`[QueueManager]: Error updating confirmation job ${jobId}:`, error.message);
    }
  }

  async fetchOrderForConfirmation(orderId: string): Promise<OrderWithMerchant | null> {
    const { data: order, error: orderErr } = await this.supabase
      .from('orders')
      .select('id, merchant_id, external_order_id, customer_phone, customer_name, tracking_uuid')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      console.warn(`[QueueManager]: Could not fetch order ${orderId}:`, orderErr?.message);
      return null;
    }

    const { data: merchant } = await this.supabase
      .from('merchants')
      .select('id, store_name, telegram_tracking_link_enabled, confirmation_telegram_enabled, subscription_tier, subscription_status')
      .eq('id', order.merchant_id)
      .maybeSingle();

    return {
      ...order,
      merchant: merchant
        ? {
            id: merchant.id,
            store_name: merchant.store_name,
            telegram_tracking_link_enabled: Boolean(merchant.telegram_tracking_link_enabled),
            confirmation_telegram_enabled: Boolean((merchant as any).confirmation_telegram_enabled),
            subscription_tier: (merchant as any).subscription_tier || 'starter',
            subscription_status: (merchant as any).subscription_status || 'active',
          }
        : null,
    };
  }
}
