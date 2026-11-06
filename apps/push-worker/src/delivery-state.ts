export type PushOutboxStatus =
  | 'pending'
  | 'processing'
  | 'retry'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'dead_letter';

export interface PushOutboxJob {
  id: string;
  order_history_id: string;
  order_push_subscription_id: string;
  idempotency_key: string;
  status: PushOutboxStatus;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  locked_by: string | null;
  locked_at: string | null;
  lease_expires_at: string | null;
  result_code: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface SubscribedDevice {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface OrderPushAssociation {
  id: string;
  order_id: string;
  push_subscription_id: string;
  revoked_at: string | null;
  device: SubscribedDevice;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  eventId: string;
}

export type AttemptOperation = 'push_send' | 'subscription_cleanup';

export interface PushSendResult {
  success: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  isExpiredSubscription?: boolean;
  isRetryable?: boolean;
  retryAfterSeconds?: number;
}

