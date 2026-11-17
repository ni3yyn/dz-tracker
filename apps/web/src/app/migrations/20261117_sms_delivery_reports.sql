-- Carrier delivery receipts for native Android SMS.
-- Existing messages remain not_requested: they were sent by app versions
-- that did not request delivery reports, so we must not invent their status.

ALTER TABLE public.sms_tracking_outbox
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_status_code INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

ALTER TABLE public.sms_tracking_outbox
  DROP CONSTRAINT IF EXISTS sms_tracking_outbox_delivery_status_check;

ALTER TABLE public.sms_tracking_outbox
  ADD CONSTRAINT sms_tracking_outbox_delivery_status_check
  CHECK (delivery_status IN ('not_requested', 'pending', 'delivered', 'failed', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_sms_tracking_outbox_delivery_status
  ON public.sms_tracking_outbox (merchant_id, delivery_status, created_at DESC);

COMMENT ON COLUMN public.sms_tracking_outbox.delivery_status IS
  'Carrier SMS delivery receipt state; separate from Android SMS submission state.';
COMMENT ON COLUMN public.sms_tracking_outbox.delivered_at IS
  'Timestamp when the sender phone received a positive carrier delivery report.';
COMMENT ON COLUMN public.sms_tracking_outbox.delivery_reported_at IS
  'Timestamp when the sender phone received the latest carrier status report.';
