-- Native SMS reliability hardening.
-- Apply after 20261116_sms_carrier_routing.sql.
-- Pending SMS jobs survive local pause, merchant pause, temporary SIM failures,
-- and network interruptions. Unsent jobs expire 72 hours after order creation.
-- Ambiguous sends are never blindly retried.

ALTER TABLE public.sms_tracking_outbox
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS last_claim_token UUID,
  ADD COLUMN IF NOT EXISTS dispatch_started_at TIMESTAMPTZ;

-- Existing in-flight jobs were claimed by older app versions without a
-- dispatch handshake. Treat them conservatively as possibly submitted.
UPDATE public.sms_tracking_outbox
   SET expires_at = COALESCE(expires_at, created_at + INTERVAL '72 hours'),
       dispatch_started_at = CASE
         WHEN status = 'processing' THEN COALESCE(dispatch_started_at, locked_at, updated_at, NOW())
         ELSE dispatch_started_at
       END
 WHERE expires_at IS NULL
    OR (status = 'processing' AND dispatch_started_at IS NULL);

ALTER TABLE public.sms_tracking_outbox
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '72 hours'),
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.sms_tracking_outbox
  DROP CONSTRAINT IF EXISTS sms_tracking_outbox_status_check;

ALTER TABLE public.sms_tracking_outbox
  ADD CONSTRAINT sms_tracking_outbox_status_check
  CHECK (status IN (
    'pending', 'processing', 'retry', 'submitted', 'failed',
    'unknown', 'skipped', 'dead_letter', 'expired'
  ));

CREATE INDEX IF NOT EXISTS idx_sms_tracking_outbox_expiry
  ON public.sms_tracking_outbox (merchant_id, expires_at, available_at)
  WHERE status IN ('pending', 'retry', 'processing');

CREATE INDEX IF NOT EXISTS idx_sms_tracking_outbox_device_claim
  ON public.sms_tracking_outbox (merchant_id, locked_by, lease_expires_at)
  WHERE status = 'processing';

-- Every new job has a strict 72-hour usefulness window. Unsupported phone
-- numbers remain visible as skipped rather than silently disappearing.
CREATE OR REPLACE FUNCTION public.trg_fn_orders_create_sms_tracking_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_operator_code TEXT;
  v_expires_at TIMESTAMPTZ;
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

  v_operator_code := public.detect_algerian_mobile_operator(NEW.customer_phone);
  v_expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '72 hours';

  INSERT INTO public.sms_tracking_outbox (
    order_id,
    merchant_id,
    idempotency_key,
    status,
    available_at,
    recipient_operator,
    expires_at,
    result_code,
    last_error
  )
  VALUES (
    NEW.id,
    NEW.merchant_id,
    'sms:tracking-link:' || NEW.id::TEXT,
    CASE
      WHEN v_operator_code IS NULL THEN 'skipped'
      WHEN v_expires_at <= NOW() THEN 'expired'
      ELSE 'pending'
    END,
    NOW(),
    v_operator_code,
    v_expires_at,
    CASE
      WHEN v_operator_code IS NULL THEN 'unsupported_recipient_network'
      WHEN v_expires_at <= NOW() THEN 'order_sms_window_expired'
      ELSE NULL
    END,
    CASE
      WHEN v_operator_code IS NULL
        THEN 'The customer number does not match a supported Algerian mobile network (05, 06 or 07).'
      WHEN v_expires_at <= NOW()
        THEN 'The 72-hour SMS window had already elapsed when this job was created.'
      ELSE NULL
    END
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- If the merchant corrects a destination number before dispatch, repair the
-- queued job and route it to the corrected carrier. If dispatch already began,
-- preserve an unknown result instead of sending to two different numbers.
CREATE OR REPLACE FUNCTION public.trg_fn_orders_refresh_sms_tracking_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_operator_code TEXT;
  v_job public.sms_tracking_outbox%ROWTYPE;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF NEW.customer_phone IS NOT DISTINCT FROM OLD.customer_phone THEN
    RETURN NEW;
  END IF;

  SELECT sms_tracking_enabled
    INTO v_enabled
    FROM public.merchants
   WHERE id = NEW.merchant_id;

  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_operator_code := public.detect_algerian_mobile_operator(NEW.customer_phone);
  v_expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '72 hours';

  SELECT *
    INTO v_job
    FROM public.sms_tracking_outbox
   WHERE order_id = NEW.id
     AND merchant_id = NEW.merchant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    IF NEW.customer_phone IS NOT NULL AND BTRIM(NEW.customer_phone) <> '' THEN
      INSERT INTO public.sms_tracking_outbox (
        order_id, merchant_id, idempotency_key, status, available_at,
        recipient_operator, expires_at, result_code, last_error
      )
      VALUES (
        NEW.id,
        NEW.merchant_id,
        'sms:tracking-link:' || NEW.id::TEXT,
        CASE
          WHEN v_operator_code IS NULL THEN 'skipped'
          WHEN v_expires_at <= NOW() THEN 'expired'
          ELSE 'pending'
        END,
        NOW(),
        v_operator_code,
        v_expires_at,
        CASE
          WHEN v_operator_code IS NULL THEN 'unsupported_recipient_network'
          WHEN v_expires_at <= NOW() THEN 'order_sms_window_expired'
          ELSE NULL
        END,
        CASE
          WHEN v_operator_code IS NULL THEN 'The corrected customer number is not a supported Algerian mobile number.'
          WHEN v_expires_at <= NOW() THEN 'The 72-hour SMS window had already elapsed.'
          ELSE NULL
        END
      )
      ON CONFLICT (order_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF v_job.status = 'submitted' OR v_job.status = 'unknown' THEN
    RETURN NEW;
  END IF;

  IF v_job.status = 'processing' AND v_job.dispatch_started_at IS NOT NULL THEN
    UPDATE public.sms_tracking_outbox
       SET status = 'unknown',
           result_code = 'recipient_changed_after_dispatch_started',
           last_error = 'The customer phone number changed after Android dispatch began. Verify the original send before any resend.',
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE id = v_job.id;
    RETURN NEW;
  END IF;

  UPDATE public.sms_tracking_outbox
     SET recipient_operator = v_operator_code,
         status = CASE
           WHEN v_expires_at <= NOW() THEN 'expired'
           WHEN v_operator_code IS NULL THEN 'skipped'
           ELSE 'pending'
         END,
         available_at = NOW(),
         result_code = CASE
           WHEN v_expires_at <= NOW() THEN 'order_sms_window_expired'
           WHEN v_operator_code IS NULL THEN 'unsupported_recipient_network'
           ELSE 'recipient_phone_corrected'
         END,
         last_error = CASE
           WHEN v_expires_at <= NOW() THEN 'The 72-hour SMS window had already elapsed.'
           WHEN v_operator_code IS NULL THEN 'The corrected customer number is not a supported Algerian mobile number.'
           ELSE NULL
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         dispatch_started_at = NULL,
         updated_at = NOW()
   WHERE id = v_job.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refresh_sms_tracking_phone ON public.orders;
CREATE TRIGGER trg_orders_refresh_sms_tracking_phone
AFTER UPDATE OF customer_phone ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_orders_refresh_sms_tracking_phone();

-- Convert the old unscoped native phone to a carrier-specific line after the
-- app identifies its explicitly selected primary SIM. Do not steal an occupied
-- carrier slot or silently change a previously classified sender.
CREATE OR REPLACE FUNCTION public.assign_native_sms_gateway_legacy_operator(
  p_token_hash TEXT,
  p_operator_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_device public.sms_gateway_devices%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}
    RETURN FALSE;
  END IF;

  SELECT merchant_id
    INTO v_merchant_id
    FROM public.sms_gateway_devices
   WHERE token_hash = p_token_hash
     AND merchant_id IS NOT NULL
     AND enabled IS TRUE
     AND revoked_at IS NULL;

  IF v_merchant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Pairing and auto-classification serialize on the merchant row.
  PERFORM 1
    FROM public.merchants
   WHERE id = v_merchant_id
   FOR UPDATE;

  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices
   WHERE token_hash = p_token_hash
     AND merchant_id = v_merchant_id
     AND enabled IS TRUE
     AND revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_device.operator_code IS NOT NULL THEN
    RETURN v_device.operator_code = p_operator_code;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS other_device
     WHERE other_device.merchant_id = v_merchant_id
       AND other_device.device_id <> v_device.device_id
       AND other_device.operator_code = p_operator_code
       AND other_device.enabled = TRUE
       AND other_device.revoked_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.sms_gateway_devices
     SET operator_code = p_operator_code,
         updated_at = NOW()
   WHERE device_id = v_device.device_id
     AND merchant_id = v_merchant_id
     AND revoked_at IS NULL;

  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_native_sms_gateway_legacy_operator(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_native_sms_gateway_legacy_operator(TEXT, TEXT)
  TO service_role;

-- New app versions persist the claimed job before calling SmsManager, then
-- explicitly mark the point at which an SMS may actually have been submitted.
-- Older app versions omit p_dispatch_protocol and are treated conservatively:
-- the claim itself is marked dispatch-started so a crash cannot create a
-- duplicate during the compatibility window.
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.poll_native_sms_gateway(
  p_token_hash TEXT,
  p_app_version TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 180,
  p_dispatch_protocol BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device public.sms_gateway_devices%ROWTYPE;
  v_global_enabled BOOLEAN;
  v_sms_enabled BOOLEAN;
  v_claim_token UUID;
  v_job public.sms_tracking_outbox%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('errorCode', 'unauthorized');
  END IF;

  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices
   WHERE token_hash = p_token_hash
     AND merchant_id IS NOT NULL
     AND revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('errorCode', 'unauthorized');
  END IF;

  UPDATE public.sms_gateway_devices
     SET last_seen_at = NOW(),
         app_version = CASE
           WHEN p_app_version IS NULL OR BTRIM(p_app_version) = '' THEN app_version
           ELSE LEFT(BTRIM(p_app_version), 32)
         END,
         updated_at = NOW()
   WHERE device_id = v_device.device_id
  RETURNING * INTO v_device;

  -- Expire all unsent queue entries once their usefulness window ends.
  UPDATE public.sms_tracking_outbox
     SET status = 'expired',
         result_code = 'order_sms_window_expired',
         last_error = 'The order tracking SMS was not submitted within 72 hours of order creation.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status IN ('pending', 'retry')
     AND expires_at <= NOW();

  UPDATE public.sms_tracking_outbox
     SET status = 'expired',
         result_code = 'order_sms_window_expired_before_dispatch',
         last_error = 'The 72-hour window elapsed before Android began submitting this SMS.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status = 'processing'
     AND dispatch_started_at IS NULL
     AND expires_at <= NOW();

  -- If no dispatch marker was recorded, the app could not have called
  -- SmsManager. Requeue safely. Once dispatch began, the result is ambiguous
  -- and must be surfaced as unknown instead of being automatically resent.
  UPDATE public.sms_tracking_outbox
     SET status = CASE
           WHEN dispatch_started_at IS NULL THEN 'retry'
           ELSE 'unknown'
         END,
         available_at = CASE
           WHEN dispatch_started_at IS NULL THEN NOW() + INTERVAL '15 seconds'
           ELSE available_at
         END,
         result_code = CASE
           WHEN dispatch_started_at IS NULL THEN 'claim_lease_expired_before_dispatch'
           ELSE 'dispatch_lease_expired_result_unknown'
         END,
         last_error = CASE
           WHEN dispatch_started_at IS NULL
             THEN 'The phone did not finish preparing the SMS. No SMS dispatch was started; the job was returned to the queue.'
           ELSE 'The phone stopped reporting after SMS dispatch began. The SMS may have been sent; no automatic duplicate was attempted.'
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE claim_token END,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status = 'processing'
     AND locked_by = v_device.device_id
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW();

  IF v_device.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('deviceDisabled', TRUE);
  END IF;

  SELECT enabled
    INTO v_global_enabled
    FROM public.sms_gateway_control
   WHERE id = 'primary';

  IF v_global_enabled IS NULL THEN
    RETURN jsonb_build_object('errorCode', 'gateway_control_unavailable');
  END IF;

  IF v_global_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('gatewayPaused', TRUE);
  END IF;

  SELECT sms_tracking_enabled
    INTO v_sms_enabled
    FROM public.merchants
   WHERE id = v_device.merchant_id;

  -- Turning the merchant preference off pauses new dispatches. It does not
  -- discard jobs already queued; re-enabling within 72 hours resumes them.
  IF v_sms_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('merchantDisabled', TRUE);
  END IF;

  IF v_device.operator_code IS NULL THEN
    RETURN jsonb_build_object('operatorUnassigned', TRUE);
  END IF;

  -- Only one in-flight job per sender device. This also prevents an HTTP
  -- response lost during a claim from causing the next poll to reserve another
  -- message while the first claim is still alive.
  SELECT job.id
    INTO v_job.id
    FROM public.sms_tracking_outbox AS job
   WHERE job.merchant_id = v_device.merchant_id
     AND job.status IN ('pending', 'retry')
     AND job.available_at <= NOW()
     AND job.expires_at > NOW()
     AND job.recipient_operator = v_device.operator_code
     AND NOT EXISTS (
       SELECT 1
         FROM public.sms_tracking_outbox AS held
        WHERE held.merchant_id = v_device.merchant_id
          AND held.locked_by = v_device.device_id
          AND held.status = 'processing'
     )
   ORDER BY job.available_at ASC, job.created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('job', NULL, 'operatorCode', v_device.operator_code);
  END IF;

  v_claim_token := gen_random_uuid();

  UPDATE public.sms_tracking_outbox
     SET status = 'processing',
         locked_by = v_device.device_id,
         last_device_id = v_device.device_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(60, LEAST(p_lease_seconds, 900))),
         claim_token = v_claim_token,
         last_claim_token = v_claim_token,
         dispatch_started_at = CASE
           WHEN p_dispatch_protocol THEN NULL
           ELSE NOW()
         END,
         attempt_count = attempt_count + CASE
           WHEN p_dispatch_protocol THEN 0
           ELSE 1
         END,
         updated_at = NOW()
   WHERE id = v_job.id
     AND merchant_id = v_device.merchant_id
  RETURNING * INTO v_job;

  UPDATE public.sms_gateway_devices
     SET last_claim_at = NOW(),
         updated_at = NOW()
   WHERE device_id = v_device.device_id;

  RETURN jsonb_build_object(
    'job', to_jsonb(v_job),
    'deviceId', v_device.device_id,
    'merchantId', v_device.merchant_id,
    'operatorCode', v_device.operator_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN)
  TO service_role;

-- Dispatch start is an explicit, idempotent handshake. The attempt counter is
-- incremented only when the new phone is about to call Android SmsManager.
CREATE OR REPLACE FUNCTION public.begin_native_sms_job_dispatch(
  p_job_id UUID,
  p_merchant_id UUID,
  p_device_id TEXT,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.sms_tracking_outbox%ROWTYPE;
BEGIN
  SELECT *
    INTO v_job
    FROM public.sms_tracking_outbox
   WHERE id = p_job_id
     AND merchant_id = p_merchant_id
     AND last_device_id = p_device_id
     AND locked_by = p_device_id
     AND claim_token = p_claim_token
     AND status = 'processing'
   FOR UPDATE;

  IF NOT FOUND OR v_job.expires_at <= NOW() THEN
    RETURN FALSE;
  END IF;

  IF v_job.dispatch_started_at IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  UPDATE public.sms_tracking_outbox
     SET dispatch_started_at = NOW(),
         attempt_count = attempt_count + 1,
         lease_expires_at = NOW() + INTERVAL '5 minutes',
         updated_at = NOW()
   WHERE id = p_job_id
     AND merchant_id = p_merchant_id
     AND locked_by = p_device_id
     AND claim_token = p_claim_token
     AND status = 'processing'
     AND dispatch_started_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_native_sms_job_dispatch(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_native_sms_job_dispatch(UUID, UUID, TEXT, UUID)
  TO service_role;

-- Line pause and revoke preserve a pre-dispatch claim as retryable. Only jobs
-- for which Android may already have submitted an SMS become unknown.
CREATE OR REPLACE FUNCTION public.set_native_sms_gateway_device_enabled(
  p_merchant_id UUID,
  p_device_id TEXT,
  p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device public.sms_gateway_devices%ROWTYPE;
BEGIN
  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices
   WHERE merchant_id = p_merchant_id
     AND device_id = p_device_id
     AND revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_enabled IS TRUE AND EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS other_device
     WHERE other_device.merchant_id = p_merchant_id
       AND other_device.device_id <> p_device_id
       AND other_device.operator_code IS NOT DISTINCT FROM v_device.operator_code
       AND other_device.enabled = TRUE
       AND other_device.revoked_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  IF p_enabled IS FALSE THEN
    UPDATE public.sms_tracking_outbox
       SET status = CASE
             WHEN dispatch_started_at IS NULL AND expires_at > NOW() THEN 'retry'
             WHEN dispatch_started_at IS NULL THEN 'expired'
             ELSE 'unknown'
           END,
           available_at = CASE WHEN dispatch_started_at IS NULL THEN NOW() ELSE available_at END,
           result_code = CASE
             WHEN dispatch_started_at IS NULL THEN 'sender_line_disabled_before_dispatch'
             ELSE 'sender_line_disabled_after_dispatch_started'
           END,
           last_error = CASE
             WHEN dispatch_started_at IS NULL
               THEN 'The sender line was paused before Android dispatch began. The order remains queued for this line to be enabled again.'
             ELSE 'The sender line was paused after SMS dispatch began. Verify the outcome before any manual resend.'
           END,
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           claim_token = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE claim_token END,
           updated_at = NOW()
     WHERE status = 'processing'
       AND locked_by = p_device_id
       AND merchant_id = p_merchant_id;
  END IF;

  UPDATE public.sms_gateway_devices
     SET enabled = p_enabled,
         updated_at = NOW()
   WHERE device_id = p_device_id
     AND merchant_id = p_merchant_id
     AND revoked_at IS NULL;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.set_native_sms_gateway_device_enabled(UUID, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_native_sms_gateway_device_enabled(UUID, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_native_sms_gateway_device(
  p_merchant_id UUID,
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.sms_tracking_outbox
     SET status = CASE
           WHEN dispatch_started_at IS NULL AND expires_at > NOW() THEN 'retry'
           WHEN dispatch_started_at IS NULL THEN 'expired'
           ELSE 'unknown'
         END,
         available_at = CASE WHEN dispatch_started_at IS NULL THEN NOW() ELSE available_at END,
         result_code = CASE
           WHEN dispatch_started_at IS NULL THEN 'sender_line_revoked_before_dispatch'
           ELSE 'sender_line_revoked_after_dispatch_started'
         END,
         last_error = CASE
           WHEN dispatch_started_at IS NULL
             THEN 'The sender line was revoked before Android dispatch began. The order remains queued for another authorized line.'
           ELSE 'The sender line was revoked after SMS dispatch began. Verify the outcome before any manual resend.'
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE claim_token END,
         updated_at = NOW()
   WHERE status = 'processing'
     AND locked_by = p_device_id
     AND merchant_id = p_merchant_id;

  UPDATE public.sms_gateway_devices
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE merchant_id = p_merchant_id
     AND device_id = p_device_id
     AND revoked_at IS NULL
  RETURNING TRUE INTO v_updated;

  RETURN COALESCE(v_updated, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_native_sms_gateway_device(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_native_sms_gateway_device(UUID, TEXT)
  TO service_role;

-- The legacy Termux worker shares the outbox. Respect the same 72-hour expiry
-- while retaining its conservative unknown-on-expired-lease behavior.
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
     SET status = 'expired',
         result_code = 'order_sms_window_expired',
         last_error = 'The order tracking SMS was not submitted within 72 hours of order creation.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE status IN ('pending', 'retry')
     AND expires_at <= NOW();

  UPDATE public.sms_tracking_outbox
     SET status = 'unknown',
         result_code = 'device_lease_expired',
         last_error = COALESCE(last_error, 'The SMS gateway did not report the result before its lease expired. No automatic resend was attempted.'),
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         updated_at = NOW()
   WHERE status = 'processing'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW()
     AND dispatch_started_at IS NOT NULL;

  UPDATE public.sms_tracking_outbox
     SET status = CASE WHEN expires_at <= NOW() THEN 'expired' ELSE 'retry' END,
         available_at = NOW() + INTERVAL '15 seconds',
         result_code = 'claim_lease_expired_before_dispatch',
         last_error = 'The legacy gateway lease expired before a dispatch result was recorded. The job was returned to the queue.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE status = 'processing'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW()
     AND dispatch_started_at IS NULL;

  SELECT job.id
    INTO v_job_id
    FROM public.sms_tracking_outbox AS job
   WHERE job.status IN ('pending', 'retry')
     AND job.available_at <= NOW()
     AND job.expires_at > NOW()
     AND NOT EXISTS (
       SELECT 1
         FROM public.sms_gateway_devices AS device
        WHERE device.merchant_id = job.merchant_id
          AND device.revoked_at IS NULL
     )
   ORDER BY job.available_at ASC, job.created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.sms_tracking_outbox AS job
     SET status = 'processing',
         locked_by = p_worker_id,
         last_device_id = p_worker_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 900))),
         dispatch_started_at = NOW(),
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE job.id = v_job_id
     AND job.expires_at > NOW()
     AND NOT EXISTS (
       SELECT 1
         FROM public.sms_gateway_devices AS device
        WHERE device.merchant_id = job.merchant_id
          AND device.revoked_at IS NULL
     )
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_sms_tracking_job(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sms_tracking_job(TEXT, INTEGER)
  TO service_role;

ALTER TABLE public.sms_tracking_attempts
  DROP CONSTRAINT IF EXISTS sms_tracking_attempts_outcome_check;

ALTER TABLE public.sms_tracking_attempts
  ADD CONSTRAINT sms_tracking_attempts_outcome_check
  CHECK (outcome IN ('submitted', 'failed', 'unknown', 'not_sent'));

     OR p_operator_code IS NULL
     OR p_operator_code NOT IN ('djezzy', 'mobilis', 'ooredoo') THEN
    RETURN FALSE;
  END IF;

  SELECT merchant_id
    INTO v_merchant_id
    FROM public.sms_gateway_devices
   WHERE token_hash = p_token_hash
     AND merchant_id IS NOT NULL
     AND revoked_at IS NULL;

  IF v_merchant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Pairing and auto-classification serialize on the merchant row.
  PERFORM 1
    FROM public.merchants
   WHERE id = v_merchant_id
   FOR UPDATE;

  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices
   WHERE token_hash = p_token_hash
     AND merchant_id = v_merchant_id
     AND revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_device.operator_code IS NOT NULL THEN
    RETURN v_device.operator_code = p_operator_code;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS other_device
     WHERE other_device.merchant_id = v_merchant_id
       AND other_device.device_id <> v_device.device_id
       AND other_device.operator_code = p_operator_code
       AND other_device.enabled = TRUE
       AND other_device.revoked_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.sms_gateway_devices
     SET operator_code = p_operator_code,
         updated_at = NOW()
   WHERE device_id = v_device.device_id
     AND merchant_id = v_merchant_id
     AND revoked_at IS NULL;

  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_native_sms_gateway_legacy_operator(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_native_sms_gateway_legacy_operator(TEXT, TEXT)
  TO service_role;

-- New app versions persist the claimed job before calling SmsManager, then
-- explicitly mark the point at which an SMS may actually have been submitted.
-- Older app versions omit p_dispatch_protocol and are treated conservatively:
-- the claim itself is marked dispatch-started so a crash cannot create a
-- duplicate during the compatibility window.
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.poll_native_sms_gateway(
  p_token_hash TEXT,
  p_app_version TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 180,
  p_dispatch_protocol BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device public.sms_gateway_devices%ROWTYPE;
  v_global_enabled BOOLEAN;
  v_sms_enabled BOOLEAN;
  v_job public.sms_tracking_outbox%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('errorCode', 'unauthorized');
  END IF;

  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices
   WHERE token_hash = p_token_hash
     AND merchant_id IS NOT NULL
     AND revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('errorCode', 'unauthorized');
  END IF;

  UPDATE public.sms_gateway_devices
     SET last_seen_at = NOW(),
         app_version = CASE
           WHEN p_app_version IS NULL OR BTRIM(p_app_version) = '' THEN app_version
           ELSE LEFT(BTRIM(p_app_version), 32)
         END,
         updated_at = NOW()
   WHERE device_id = v_device.device_id
  RETURNING * INTO v_device;

  -- Expire all unsent queue entries once their usefulness window ends.
  UPDATE public.sms_tracking_outbox
     SET status = 'expired',
         result_code = 'order_sms_window_expired',
         last_error = 'The order tracking SMS was not submitted within 72 hours of order creation.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status IN ('pending', 'retry')
     AND expires_at <= NOW();

  UPDATE public.sms_tracking_outbox
     SET status = 'expired',
         result_code = 'order_sms_window_expired_before_dispatch',
         last_error = 'The 72-hour window elapsed before Android began submitting this SMS.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status = 'processing'
     AND dispatch_started_at IS NULL
     AND expires_at <= NOW();

  -- If no dispatch marker was recorded, the app could not have called
  -- SmsManager. Requeue safely. Once dispatch began, the result is ambiguous
  -- and must be surfaced as unknown instead of being automatically resent.
  UPDATE public.sms_tracking_outbox
     SET status = CASE
           WHEN dispatch_started_at IS NULL THEN 'retry'
           ELSE 'unknown'
         END,
         available_at = CASE
           WHEN dispatch_started_at IS NULL THEN NOW() + INTERVAL '15 seconds'
           ELSE available_at
         END,
         result_code = CASE
           WHEN dispatch_started_at IS NULL THEN 'claim_lease_expired_before_dispatch'
           ELSE 'dispatch_lease_expired_result_unknown'
         END,
         last_error = CASE
           WHEN dispatch_started_at IS NULL
             THEN 'The phone did not finish preparing the SMS. No SMS dispatch was started; the job was returned to the queue.'
           ELSE 'The phone stopped reporting after SMS dispatch began. The SMS may have been sent; no automatic duplicate was attempted.'
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE claim_token END,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status = 'processing'
     AND locked_by = v_device.device_id
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW()
     AND expires_at > NOW();

  IF v_device.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('deviceDisabled', TRUE);
  END IF;

  SELECT enabled
    INTO v_global_enabled
    FROM public.sms_gateway_control
   WHERE id = 'primary';

  IF v_global_enabled IS NULL THEN
    RETURN jsonb_build_object('errorCode', 'gateway_control_unavailable');
  END IF;

  IF v_global_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('gatewayPaused', TRUE);
  END IF;

  SELECT sms_tracking_enabled
    INTO v_sms_enabled
    FROM public.merchants
   WHERE id = v_device.merchant_id;

  -- Turning the merchant preference off pauses new dispatches. It does not
  -- discard jobs already queued; re-enabling within 72 hours resumes them.
  IF v_sms_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('merchantDisabled', TRUE);
  END IF;

  IF v_device.operator_code IS NULL THEN
    RETURN jsonb_build_object('operatorUnassigned', TRUE);
  END IF;

  -- Only one in-flight job per sender device. This also prevents an HTTP
  -- response lost during a claim from causing the next poll to reserve another
  -- message while the first claim is still alive.
  SELECT job.id
    INTO v_job.id
    FROM public.sms_tracking_outbox AS job
   WHERE job.merchant_id = v_device.merchant_id
     AND job.status IN ('pending', 'retry')
     AND job.available_at <= NOW()
     AND job.expires_at > NOW()
     AND job.recipient_operator = v_device.operator_code
     AND NOT EXISTS (
       SELECT 1
         FROM public.sms_tracking_outbox AS held
        WHERE held.merchant_id = v_device.merchant_id
          AND held.locked_by = v_device.device_id
          AND held.status = 'processing'
     )
   ORDER BY job.available_at ASC, job.created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('job', NULL, 'operatorCode', v_device.operator_code);
  END IF;

  UPDATE public.sms_tracking_outbox
     SET status = 'processing',
         locked_by = v_device.device_id,
         last_device_id = v_device.device_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(60, LEAST(p_lease_seconds, 900))),
         claim_token = gen_random_uuid(),
         dispatch_started_at = CASE
           WHEN p_dispatch_protocol THEN NULL
           ELSE NOW()
         END,
         attempt_count = attempt_count + CASE
           WHEN p_dispatch_protocol THEN 0
           ELSE 1
         END,
         updated_at = NOW()
   WHERE id = v_job.id
     AND merchant_id = v_device.merchant_id
  RETURNING * INTO v_job;

  UPDATE public.sms_gateway_devices
     SET last_claim_at = NOW(),
         updated_at = NOW()
   WHERE device_id = v_device.device_id;

  RETURN jsonb_build_object(
    'job', to_jsonb(v_job),
    'deviceId', v_device.device_id,
    'merchantId', v_device.merchant_id,
    'operatorCode', v_device.operator_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN)
  TO service_role;

-- Dispatch start is an explicit, idempotent handshake. The attempt counter is
-- incremented only when the new phone is about to call Android SmsManager.
CREATE OR REPLACE FUNCTION public.begin_native_sms_job_dispatch(
  p_job_id UUID,
  p_merchant_id UUID,
  p_device_id TEXT,
  p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.sms_tracking_outbox%ROWTYPE;
BEGIN
  SELECT *
    INTO v_job
    FROM public.sms_tracking_outbox
   WHERE id = p_job_id
     AND merchant_id = p_merchant_id
     AND last_device_id = p_device_id
     AND locked_by = p_device_id
     AND claim_token = p_claim_token
     AND status = 'processing'
   FOR UPDATE;

  IF NOT FOUND OR v_job.expires_at <= NOW() THEN
    RETURN FALSE;
  END IF;

  IF v_job.dispatch_started_at IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  UPDATE public.sms_tracking_outbox
     SET dispatch_started_at = NOW(),
         attempt_count = attempt_count + 1,
         lease_expires_at = NOW() + INTERVAL '5 minutes',
         updated_at = NOW()
   WHERE id = p_job_id
     AND merchant_id = p_merchant_id
     AND locked_by = p_device_id
     AND claim_token = p_claim_token
     AND status = 'processing'
     AND dispatch_started_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_native_sms_job_dispatch(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_native_sms_job_dispatch(UUID, UUID, TEXT, UUID)
  TO service_role;

-- Line pause and revoke preserve a pre-dispatch claim as retryable. Only jobs
-- for which Android may already have submitted an SMS become unknown.
CREATE OR REPLACE FUNCTION public.set_native_sms_gateway_device_enabled(
  p_merchant_id UUID,
  p_device_id TEXT,
  p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device public.sms_gateway_devices%ROWTYPE;
BEGIN
  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices
   WHERE merchant_id = p_merchant_id
     AND device_id = p_device_id
     AND revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_enabled IS TRUE AND EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS other_device
     WHERE other_device.merchant_id = p_merchant_id
       AND other_device.device_id <> p_device_id
       AND other_device.operator_code IS NOT DISTINCT FROM v_device.operator_code
       AND other_device.enabled = TRUE
       AND other_device.revoked_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  IF p_enabled IS FALSE THEN
    UPDATE public.sms_tracking_outbox
       SET status = CASE
             WHEN dispatch_started_at IS NULL AND expires_at > NOW() THEN 'retry'
             WHEN dispatch_started_at IS NULL THEN 'expired'
             ELSE 'unknown'
           END,
           available_at = CASE WHEN dispatch_started_at IS NULL THEN NOW() ELSE available_at END,
           result_code = CASE
             WHEN dispatch_started_at IS NULL THEN 'sender_line_disabled_before_dispatch'
             ELSE 'sender_line_disabled_after_dispatch_started'
           END,
           last_error = CASE
             WHEN dispatch_started_at IS NULL
               THEN 'The sender line was paused before Android dispatch began. The order remains queued for this line to be enabled again.'
             ELSE 'The sender line was paused after SMS dispatch began. Verify the outcome before any manual resend.'
           END,
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           claim_token = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE claim_token END,
           updated_at = NOW()
     WHERE status = 'processing'
       AND locked_by = p_device_id
       AND merchant_id = p_merchant_id;
  END IF;

  UPDATE public.sms_gateway_devices
     SET enabled = p_enabled,
         updated_at = NOW()
   WHERE device_id = p_device_id
     AND merchant_id = p_merchant_id
     AND revoked_at IS NULL;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.set_native_sms_gateway_device_enabled(UUID, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_native_sms_gateway_device_enabled(UUID, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_native_sms_gateway_device(
  p_merchant_id UUID,
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.sms_tracking_outbox
     SET status = CASE
           WHEN dispatch_started_at IS NULL AND expires_at > NOW() THEN 'retry'
           WHEN dispatch_started_at IS NULL THEN 'expired'
           ELSE 'unknown'
         END,
         available_at = CASE WHEN dispatch_started_at IS NULL THEN NOW() ELSE available_at END,
         result_code = CASE
           WHEN dispatch_started_at IS NULL THEN 'sender_line_revoked_before_dispatch'
           ELSE 'sender_line_revoked_after_dispatch_started'
         END,
         last_error = CASE
           WHEN dispatch_started_at IS NULL
             THEN 'The sender line was revoked before Android dispatch began. The order remains queued for another authorized line.'
           ELSE 'The sender line was revoked after SMS dispatch began. Verify the outcome before any manual resend.'
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = CASE WHEN dispatch_started_at IS NULL THEN NULL ELSE claim_token END,
         updated_at = NOW()
   WHERE status = 'processing'
     AND locked_by = p_device_id
     AND merchant_id = p_merchant_id;

  UPDATE public.sms_gateway_devices
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE merchant_id = p_merchant_id
     AND device_id = p_device_id
     AND revoked_at IS NULL
  RETURNING TRUE INTO v_updated;

  RETURN COALESCE(v_updated, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_native_sms_gateway_device(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_native_sms_gateway_device(UUID, TEXT)
  TO service_role;

-- The legacy Termux worker shares the outbox. Respect the same 72-hour expiry
-- while retaining its conservative unknown-on-expired-lease behavior.
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
     SET status = 'expired',
         result_code = 'order_sms_window_expired',
         last_error = 'The order tracking SMS was not submitted within 72 hours of order creation.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE status IN ('pending', 'retry')
     AND expires_at <= NOW();

  UPDATE public.sms_tracking_outbox
     SET status = 'unknown',
         result_code = 'device_lease_expired',
         last_error = COALESCE(last_error, 'The SMS gateway did not report the result before its lease expired. No automatic resend was attempted.'),
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         updated_at = NOW()
   WHERE status = 'processing'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW()
     AND dispatch_started_at IS NOT NULL;

  UPDATE public.sms_tracking_outbox
     SET status = CASE WHEN expires_at <= NOW() THEN 'expired' ELSE 'retry' END,
         available_at = NOW() + INTERVAL '15 seconds',
         result_code = 'claim_lease_expired_before_dispatch',
         last_error = 'The legacy gateway lease expired before a dispatch result was recorded. The job was returned to the queue.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE status = 'processing'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW()
     AND dispatch_started_at IS NULL;

  SELECT job.id
    INTO v_job_id
    FROM public.sms_tracking_outbox AS job
   WHERE job.status IN ('pending', 'retry')
     AND job.available_at <= NOW()
     AND job.expires_at > NOW()
     AND NOT EXISTS (
       SELECT 1
         FROM public.sms_gateway_devices AS device
        WHERE device.merchant_id = job.merchant_id
          AND device.revoked_at IS NULL
     )
   ORDER BY job.available_at ASC, job.created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.sms_tracking_outbox AS job
     SET status = 'processing',
         locked_by = p_worker_id,
         last_device_id = p_worker_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 900))),
         dispatch_started_at = NOW(),
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE job.id = v_job_id
     AND job.expires_at > NOW()
     AND NOT EXISTS (
       SELECT 1
         FROM public.sms_gateway_devices AS device
        WHERE device.merchant_id = job.merchant_id
          AND device.revoked_at IS NULL
     )
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_sms_tracking_job(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sms_tracking_job(TEXT, INTEGER)
  TO service_role;

ALTER TABLE public.sms_tracking_attempts
  DROP CONSTRAINT IF EXISTS sms_tracking_attempts_outcome_check;

ALTER TABLE public.sms_tracking_attempts
  ADD CONSTRAINT sms_tracking_attempts_outcome_check
  CHECK (outcome IN ('submitted', 'failed', 'unknown', 'not_sent'));
