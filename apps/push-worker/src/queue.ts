import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './database.types.js';
import { PushWorkerConfig } from './config.js';
import {
  PushOutboxJob,
  PushOutboxStatus,
  AttemptOperation,
} from './delivery-state.js';

export interface PushJobContext {
  jobId: string;
  orderHistory: {
    id: string;
    orderId: string;
    statusRaw: string;
    statusTitle: string;
    description: string | null;
    eventType: string;
    createdAt: string;
  };
  orderPushSubscription: {
    id: string;
    orderId: string;
    pushSubscriptionId: string;
    revokedAt: string | null;
  };
  deviceSubscription: {
    id: string;
    endpoint: string;
    p256dh: string;
    authSecret: string;
    status: 'active' | 'expired' | 'revoked';
  };
  order: {
    id: string;
    trackingUuid: string;
    merchantId: string;
  };
  merchant: {
    id: string;
    storeName: string;
  } | null;
}

export class PushQueueManager {
  private readonly supabase: SupabaseClient<Database>;

  constructor(private readonly config: PushWorkerConfig) {
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

  async setWorkerEnabled(enabled: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('web_push_worker_state')
      .update({
        is_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      console.warn('[PushQueueManager]: Failed to update worker is_enabled state:', error.message);
    }
  }

  async updateHeartbeat(workerId: string, leaseSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    await this.supabase
      .from('web_push_worker_state')
      .update({
        lease_owner: workerId,
        lease_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
  }

  async pauseWorkerUntil(pausedUntil: Date): Promise<void> {
    await this.supabase
      .from('web_push_worker_state')
      .update({
        paused_until: pausedUntil.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
  }

  async claimNextJob(workerId: string, leaseSeconds: number): Promise<PushOutboxJob | null> {
    const { data, error } = await this.supabase.rpc('claim_next_web_push_job', {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });

    if (error) {
      console.error('[PushQueueManager]: Failed to claim next push job:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data[0] as PushOutboxJob;
  }

  async fetchJobContext(
    orderHistoryId: string,
    orderPushSubscriptionId: string
  ): Promise<PushJobContext | null> {
    // 1. Fetch order_history
    const { data: history, error: histErr } = await this.supabase
      .from('order_history')
      .select('id, order_id, status_raw, status_title, description, event_type, created_at')
      .eq('id', orderHistoryId)
      .maybeSingle();

    if (histErr || !history) {
      console.warn(`[PushQueueManager]: Missing order_history ${orderHistoryId}:`, histErr?.message);
      return null;
    }

    // 2. Fetch order_push_subscription
    const { data: orderSub, error: subErr } = await this.supabase
      .from('order_push_subscriptions')
      .select('id, order_id, push_subscription_id, revoked_at')
      .eq('id', orderPushSubscriptionId)
      .maybeSingle();

    if (subErr || !orderSub) {
      console.warn(`[PushQueueManager]: Missing order_push_subscription ${orderPushSubscriptionId}:`, subErr?.message);
      return null;
    }

    // 3. Fetch web_push_subscription (device)
    const { data: device, error: devErr } = await this.supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth_secret, status')
      .eq('id', orderSub.push_subscription_id)
      .maybeSingle();

    if (devErr || !device) {
      console.warn(`[PushQueueManager]: Missing web_push_subscription ${orderSub.push_subscription_id}:`, devErr?.message);
      return null;
    }

    // 4. Fetch order
    const { data: order, error: orderErr } = await this.supabase
      .from('orders')
      .select('id, tracking_uuid, merchant_id')
      .eq('id', history.order_id)
      .maybeSingle();

    if (orderErr || !order) {
      console.warn(`[PushQueueManager]: Missing order ${history.order_id}:`, orderErr?.message);
      return null;
    }

    // 5. Fetch merchant
    let merchant: { id: string; storeName: string } | null = null;
    if (order.merchant_id) {
      const { data: m } = await this.supabase
        .from('merchants')
        .select('id, store_name')
        .eq('id', order.merchant_id)
        .maybeSingle();

      if (m) {
        merchant = {
          id: m.id,
          storeName: m.store_name,
        };
      }
    }

    return {
      jobId: '',
      orderHistory: {
        id: history.id,
        orderId: history.order_id,
        statusRaw: history.status_raw,
        statusTitle: history.status_title,
        description: history.description,
        eventType: history.event_type,
        createdAt: history.created_at,
      },
      orderPushSubscription: {
        id: orderSub.id,
        orderId: orderSub.order_id,
        pushSubscriptionId: orderSub.push_subscription_id,
        revokedAt: orderSub.revoked_at,
      },
      deviceSubscription: {
        id: device.id,
        endpoint: device.endpoint,
        p256dh: device.p256dh,
        authSecret: device.auth_secret,
        status: device.status as 'active' | 'expired' | 'revoked',
      },
      order: {
        id: order.id,
        trackingUuid: order.tracking_uuid,
        merchantId: order.merchant_id,
      },
      merchant,
    };
  }

  async recordAttempt(params: {
    jobId: string;
    attemptNumber: number;
    operation?: AttemptOperation;
    outcome: string;
    responseStatus?: number;
    errorCode?: string;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.supabase.from('web_push_attempts').insert({
        job_id: params.jobId,
        attempt_number: params.attemptNumber,
        operation: params.operation || 'push_send',
        outcome: params.outcome,
        response_status: params.responseStatus || null,
        error_code: params.errorCode || null,
        error_message: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
        duration_ms: params.durationMs || null,
      });
    } catch (err: any) {
      console.warn('[PushQueueManager]: Error recording attempt history:', err?.message);
    }
  }

  async updateJob(
    jobId: string,
    updates: {
      status?: PushOutboxStatus;
      resultCode?: string;
      errorCode?: string;
      errorMessage?: string;
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
    if (updates.availableAt) payload.available_at = updates.availableAt;
    if (updates.sentAt) payload.sent_at = updates.sentAt;

    const { error } = await this.supabase
      .from('web_push_outbox')
      .update(payload)
      .eq('id', jobId);

    if (error) {
      console.error(`[PushQueueManager]: Error updating outbox job ${jobId}:`, error.message);
    }
  }

  async deactivateSubscription(subscriptionId: string, reason: string): Promise<void> {
    try {
      await this.supabase
        .from('web_push_subscriptions')
        .update({
          status: 'expired',
          revoked_at: new Date().toISOString(),
          last_error_code: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);
    } catch (err: any) {
      console.warn(`[PushQueueManager]: Error deactivating subscription ${subscriptionId}:`, err?.message);
    }
  }

  async recordSubscriptionSuccess(subscriptionId: string): Promise<void> {
    try {
      await this.supabase
        .from('web_push_subscriptions')
        .update({
          last_success_at: new Date().toISOString(),
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);
    } catch (err: any) {
      console.warn(`[PushQueueManager]: Error recording subscription success ${subscriptionId}:`, err?.message);
    }
  }

  async releaseJob(jobId: string): Promise<void> {
    try {
      await this.supabase
        .from('web_push_outbox')
        .update({
          status: 'pending',
          locked_by: null,
          locked_at: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch (err: any) {
      console.warn(`[PushQueueManager]: Failed to release job lock for ${jobId}:`, err?.message);
    }
  }
}

