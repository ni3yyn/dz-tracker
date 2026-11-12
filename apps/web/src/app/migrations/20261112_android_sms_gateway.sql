-- TajerTrack: Android SIM SMS gateway for one tracking link per newly created order.
-- Apply once in the Supabase SQL editor before enabling SMS in merchant settings.

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS sms_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.sms_tracking_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'retry', 'submitted', 'failed', 'unknown', 'skipped', 'dead_letter')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  result_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  CONSTRAINT sms_tracking_one_job_per_order UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS public.sms_tracking_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.sms_tracking_outbox(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('submitted', 'failed', 'unknown')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, attempt_number, outcome)
);

CREATE INDEX IF NOT EXISTS idx_sms_tracking_outbox_pending
  ON public.sms_tracking_outbox (available_at, created_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_sms_tracking_outbox_lease
  ON public.sms_tracking_outbox (lease_expires_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.trg_fn_orders_create_sms_tracking_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  IF NEW.customer_phone IS NULL OR BTRIM(NEW.customer_phone) = '' THEN
    RETURN NEW;
  END IF;

  SELECT sms_tracking_enabled
    INTO v_enabled
    FROM public.merchants
   WHERE id = NEW.merchant_id;

  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sms_tracking_outbox (
    order_id, merchant_id, idempotency_key, status, available_at
  )
  VALUES (
    NEW.id, NEW.merchant_id, 'sms:tracking-link:' || NEW.id::TEXT, 'pending', NOW()
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_create_sms_tracking_job ON public.orders;
CREATE TRIGGER trg_orders_create_sms_tracking_job
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_orders_create_sms_tracking_job();

-- A job whose phone-side send outcome was never reported is marked unknown,
-- not automatically retried. This avoids duplicate customer SMS after a phone
-- reboot or an ambiguous Termux:API timeout.
CREATE OR REPLACE FUNCTION public.claim_next_sms_tracking_job(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS SETOF public.sms_tracking_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  UPDATE public.sms_tracking_outbox
     SET status = 'unknown',
         result_code = 'device_lease_expired',
         last_error = COALESCE(last_error, 'The Android gateway did not report the result before its lease expired. No automatic resend was attempted.'),
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         updated_at = NOW()
   WHERE status = 'processing'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW();

  SELECT id
    INTO v_job_id
    FROM public.sms_tracking_outbox
   WHERE status IN ('pending', 'retry')
     AND available_at <= NOW()
   ORDER BY available_at ASC, created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.sms_tracking_outbox
     SET status = 'processing',
         locked_by = p_worker_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 900))),
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE id = v_job_id
  RETURNING *;
END;
$$;

ALTER TABLE public.sms_tracking_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_tracking_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sms_tracking_outbox FROM anon, authenticated;
REVOKE ALL ON public.sms_tracking_attempts FROM anon, authenticated;
GRANT ALL ON public.sms_tracking_outbox TO service_role;
GRANT ALL ON public.sms_tracking_attempts TO service_role;

REVOKE ALL ON FUNCTION public.claim_next_sms_tracking_job(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sms_tracking_job(TEXT, INTEGER) TO service_role;
