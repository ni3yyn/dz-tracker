export type OutboxStatus =
  | 'pending'
  | 'processing'
  | 'retry'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'dead_letter';

export type AttemptOperation = 'phone_resolution' | 'message_send' | 'session_check';

export interface ResolvedTelegramRecipient {
  userId: number;
  accessHash: string;
  phone: string;
  firstName?: string;
  username?: string;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  randomId: bigint;
  errorCode?: string;
  errorMessage?: string;
}

export interface OutboxJob {
  id: string;
  order_id: string;
  merchant_id: string;
  idempotency_key: string;
  status: OutboxStatus;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  locked_by: string | null;
  locked_at: string | null;
  lease_expires_at: string | null;
  telegram_random_id: number | null;
  telegram_user_id: number | null;
  telegram_message_id: number | null;
  result_code: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

