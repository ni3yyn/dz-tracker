-- Carrier-aware native SMS sender lines.
-- Apply after 20261112_native_sms_gateway.sql.
-- One order creates one outbox job; only the active sender line for the
-- recipient's detected Algerian operator may claim that job.

ALTER TABLE public.sms_gateway_devices
  ADD COLUMN IF NOT EXISTS operator_code TEXT;

ALTER TABLE public.sms_tracking_outbox
  ADD COLUMN IF NOT EXISTS recipient_operator TEXT;

ALTER TABLE public.sms_gateway_pairing_codes
  ADD COLUMN IF NOT EXISTS operator_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_gateway_devices_operator_code_check'
       AND conrelid = 'public.sms_gateway_devices'::regclass
  ) THEN
    ALTER TABLE public.sms_gateway_devices
      ADD CONSTRAINT sms_gateway_devices_operator_code_check
      CHECK (operator_code IS NULL OR operator_code IN ('djezzy', 'mobilis', 'ooredoo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_tracking_outbox_recipient_operator_check'
       AND conrelid = 'public.sms_tracking_outbox'::regclass
  ) THEN
    ALTER TABLE public.sms_tracking_outbox
      ADD CONSTRAINT sms_tracking_outbox_recipient_operator_check
      CHECK (recipient_operator IS NULL OR recipient_operator IN ('djezzy', 'mobilis', 'ooredoo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sms_gateway_pairing_codes_operator_code_check'
       AND conrelid = 'public.sms_gateway_pairing_codes'::regclass
  ) THEN
    ALTER TABLE public.sms_gateway_pairing_codes
      ADD CONSTRAINT sms_gateway_pairing_codes_operator_code_check
      CHECK (operator_code IS NULL OR operator_code IN ('djezzy', 'mobilis', 'ooredoo'));
  END IF;
END;
$$;

-- Replace the original one-phone-per-merchant constraint with one active
-- sender line per carrier. Legacy rows (operator_code IS NULL) retain their
-- own single-device slot until they are replaced by carrier-aware pairing.
DROP INDEX IF EXISTS public.idx_sms_gateway_devices_one_active_merchant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_gateway_devices_one_active_carrier
  ON public.sms_gateway_devices (merchant_id, operator_code)
  WHERE merchant_id IS NOT NULL
    AND operator_code IS NOT NULL
    AND enabled = TRUE
    AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_gateway_devices_one_active_legacy
  ON public.sms_gateway_devices (merchant_id)
  WHERE merchant_id IS NOT NULL
    AND operator_code IS NULL
    AND enabled = TRUE
    AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_tracking_outbox_recipient_operator
  ON public.sms_tracking_outbox (merchant_id, recipient_operator, available_at, created_at)
  WHERE status IN ('pending', 'retry');

-- Number normalization is deliberately centralized and replaceable. If
-- Algeria's number-portability rules change, this is the single routing map
-- that must be updated; we never infer a carrier from a customer's name.
CREATE OR REPLACE FUNCTION public.detect_algerian_mobile_operator(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF v_digits LIKE '00213%' THEN
    v_digits := '0' || substring(v_digits FROM 6);
  ELSIF v_digits LIKE '213%' THEN
    v_digits := '0' || substring(v_digits FROM 4);
  END IF;

  IF v_digits !~ '^0[5-7][0-9]{8}$' THEN
    RETURN NULL;
  END IF;

  RETURN CASE substring(v_digits FROM 2 FOR 1)
    WHEN '5' THEN 'ooredoo'
    WHEN '6' THEN 'mobilis'
    WHEN '7' THEN 'djezzy'
    ELSE NULL
  END;
END;
$$;

-- Backfill unsent jobs. A value of NULL means unknown/unclassifiable; such
-- jobs are intentionally not claimed by a carrier-specific device.
UPDATE public.sms_tracking_outbox AS job
   SET recipient_operator = public.detect_algerian_mobile_operator(order_row.customer_phone)
  FROM public.orders AS order_row
 WHERE order_row.id = job.order_id
   AND job.recipient_operator IS NULL;

-- Invalid or unsupported destinations must not sit pending forever. They are
-- explicitly skipped and can be corrected by the merchant before a new order.
UPDATE public.sms_tracking_outbox
   SET status = 'skipped',
       result_code = 'unsupported_recipient_network',
       last_error = 'The customer number does not match a supported Algerian mobile network (05, 06 or 07). No SMS was sent.',
       updated_at = NOW()
 WHERE status IN ('pending', 'retry')
   AND recipient_operator IS NULL;

-- Keep the one-job-per-order trigger but annotate each new job at creation.
CREATE OR REPLACE FUNCTION public.trg_fn_orders_create_sms_tracking_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_operator_code TEXT;
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

  INSERT INTO public.sms_tracking_outbox (
    order_id,
    merchant_id,
    idempotency_key,
    status,
    available_at,
    recipient_operator,
    result_code,
    last_error
  )
  VALUES (
    NEW.id,
    NEW.merchant_id,
    'sms:tracking-link:' || NEW.id::TEXT,
    CASE WHEN v_operator_code IS NULL THEN 'skipped' ELSE 'pending' END,
    NOW(),
    v_operator_code,
    CASE WHEN v_operator_code IS NULL THEN 'unsupported_recipient_network' ELSE NULL END,
    CASE
      WHEN v_operator_code IS NULL
      THEN 'The customer number does not match a supported Algerian mobile network (05, 06 or 07). No SMS was sent.'
      ELSE NULL
    END
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- A device invite is scoped to one carrier slot and can be redeemed once.
-- The invite itself contains no reusable merchant credential.
CREATE TABLE IF NOT EXISTS public.sms_gateway_device_invites (
  token_hash TEXT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  operator_code TEXT NOT NULL CHECK (operator_code IN ('djezzy', 'mobilis', 'ooredoo')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_gateway_device_invites_expiry
  ON public.sms_gateway_device_invites (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.sms_gateway_device_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_gateway_device_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_gateway_device_invites TO service_role;

-- Atomically converts a single-use invitation into the short-lived pairing
-- code consumed by the Android app. The raw invite and raw pairing code are
-- never persisted.
CREATE OR REPLACE FUNCTION public.redeem_native_sms_gateway_invite(
  p_invite_hash TEXT,
  p_code_hash TEXT
)
RETURNS TABLE (
  merchant_id UUID,
  store_name TEXT,
  operator_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.sms_gateway_device_invites%ROWTYPE;
  v_store_name TEXT;
BEGIN
  IF p_invite_hash IS NULL OR p_invite_hash !~ '^[0-9a-f]{64}$'
     OR p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_invite
    FROM public.sms_gateway_device_invites AS invite
   WHERE invite.token_hash = p_invite_hash
     AND invite.consumed_at IS NULL
     AND invite.expires_at > NOW()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT merchant.store_name
    INTO v_store_name
    FROM public.merchants AS merchant
   WHERE merchant.id = v_invite.merchant_id;

  IF v_store_name IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.sms_gateway_device_invites
     SET consumed_at = NOW()
   WHERE token_hash = v_invite.token_hash
     AND consumed_at IS NULL;

  INSERT INTO public.sms_gateway_pairing_codes (
    code_hash, merchant_id, created_by, operator_code, expires_at
  )
  VALUES (
    p_code_hash,
    v_invite.merchant_id,
    v_invite.created_by,
    v_invite.operator_code,
    NOW() + INTERVAL '5 minutes'
  );

  RETURN QUERY SELECT v_invite.merchant_id, v_store_name, v_invite.operator_code;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_native_sms_gateway_invite(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_native_sms_gateway_invite(TEXT, TEXT)
  TO service_role;

-- A carrier pairing replaces only that carrier's previous device and any
-- legacy all-carrier phone. Other operator lines remain connected. In-flight
-- sends from a replaced line become unknown rather than being retried.
DROP FUNCTION IF EXISTS public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.complete_native_sms_gateway_pairing(
  p_code_hash TEXT,
  p_device_id TEXT,
  p_token_hash TEXT,
  p_token_last_four TEXT,
  p_device_name TEXT,
  p_platform TEXT,
  p_app_version TEXT
)
RETURNS TABLE (
  device_id TEXT,
  merchant_id UUID,
  store_name TEXT,
  blocked BOOLEAN,
  operator_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_store_name TEXT;
  v_operator_code TEXT;
BEGIN
  SELECT pairing.merchant_id, pairing.operator_code
    INTO v_merchant_id, v_operator_code
    FROM public.sms_gateway_pairing_codes AS pairing
   WHERE pairing.code_hash = p_code_hash
     AND pairing.consumed_at IS NULL
     AND pairing.expires_at > NOW()
   FOR UPDATE;

  IF v_merchant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT merchant.store_name
    INTO v_store_name
    FROM public.merchants AS merchant
   WHERE merchant.id = v_merchant_id;

  IF v_store_name IS NULL THEN
    RETURN;
  END IF;

  -- Do not let the legacy unscoped reconnect flow revoke carrier-specific
  -- lines. Once any operator slot exists, pairing must use a scoped invite.
  IF v_operator_code IS NULL AND EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS device
     WHERE device.merchant_id = v_merchant_id
       AND device.operator_code IS NOT NULL
       AND device.revoked_at IS NULL
  ) THEN
    RETURN QUERY SELECT NULL::TEXT, v_merchant_id, v_store_name, TRUE, NULL::TEXT;
    RETURN;
  END IF;

  -- An administratively disabled line cannot be bypassed by generating a
  -- fresh invite. The admin must explicitly re-enable or revoke that line.
  IF EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS device
     WHERE device.merchant_id = v_merchant_id
       AND device.revoked_at IS NULL
       AND device.enabled IS FALSE
       AND (
         device.operator_code IS NOT DISTINCT FROM v_operator_code
         OR (v_operator_code IS NULL AND device.operator_code IS NOT NULL)
       )
  ) OR (
    v_operator_code IS NULL
    AND EXISTS (
      SELECT 1
        FROM public.sms_gateway_devices AS device
       WHERE device.merchant_id = v_merchant_id
         AND device.operator_code IS NOT NULL
         AND device.enabled IS TRUE
         AND device.revoked_at IS NULL
    )
  ) THEN
    RETURN QUERY SELECT NULL::TEXT, v_merchant_id, v_store_name, TRUE, v_operator_code;
    RETURN;
  END IF;

  UPDATE public.sms_gateway_pairing_codes
     SET consumed_at = NOW()
   WHERE code_hash = p_code_hash
     AND consumed_at IS NULL;

  UPDATE public.sms_tracking_outbox AS job
     SET status = 'unknown',
         result_code = 'sender_line_replaced',
         last_error = 'The sender line was replaced while a gateway held this job. Check the delivery outcome before any manual resend.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         updated_at = NOW()
   WHERE job.merchant_id = v_merchant_id
     AND job.status = 'processing'
     AND (
       job.locked_by = 'android-sms-gateway'
       OR job.locked_by IN (
         SELECT device.device_id
           FROM public.sms_gateway_devices AS device
          WHERE device.merchant_id = v_merchant_id
            AND device.revoked_at IS NULL
            AND (
              v_operator_code IS NULL
              OR device.operator_code IS NULL
              OR device.operator_code = v_operator_code
            )
       )
     );

  UPDATE public.sms_gateway_devices AS device
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE device.merchant_id = v_merchant_id
     AND device.revoked_at IS NULL
     AND (
       v_operator_code IS NULL
       OR device.operator_code IS NULL
       OR device.operator_code = v_operator_code
     );

  INSERT INTO public.sms_gateway_devices (
    device_id,
    display_name,
    merchant_id,
    enabled,
    token_hash,
    token_last_four,
    platform,
    app_version,
    device_model,
    operator_code,
    connected_at,
    last_seen_at,
    created_at,
    updated_at
  )
  VALUES (
    p_device_id,
    LEFT(COALESCE(NULLIF(BTRIM(p_device_name), ''), 'Android phone'), 80),
    v_merchant_id,
    TRUE,
    p_token_hash,
    RIGHT(COALESCE(p_token_last_four, ''), 4),
    LEFT(COALESCE(NULLIF(BTRIM(p_platform), ''), 'android'), 24),
    LEFT(COALESCE(NULLIF(BTRIM(p_app_version), ''), 'unknown'), 32),
    LEFT(COALESCE(NULLIF(BTRIM(p_device_name), ''), 'Android phone'), 80),
    v_operator_code,
    NOW(),
    NOW(),
    NOW(),
    NOW()
  );

  RETURN QUERY SELECT p_device_id, v_merchant_id, v_store_name, FALSE, v_operator_code;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- The mobile app authenticates each sender-line token independently. A line
-- may claim only the matching recipient operator, never another network.
CREATE OR REPLACE FUNCTION public.poll_native_sms_gateway(
  p_token_hash TEXT,
  p_app_version TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 180
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

  IF v_sms_enabled IS DISTINCT FROM TRUE THEN
    UPDATE public.sms_tracking_outbox
       SET status = 'skipped',
           result_code = 'merchant_sms_disabled',
           last_error = 'SMS tracking was disabled for this merchant before the phone sent the message.',
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE merchant_id = v_device.merchant_id
       AND status IN ('pending', 'retry');
    RETURN jsonb_build_object('merchantDisabled', TRUE);
  END IF;

  UPDATE public.sms_tracking_outbox
     SET status = 'unknown',
         result_code = 'device_lease_expired',
         last_error = COALESCE(
           last_error,
           'The Android phone did not report the result before its lease expired. No automatic resend was attempted.'
         ),
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         updated_at = NOW()
   WHERE merchant_id = v_device.merchant_id
     AND status = 'processing'
     AND locked_by = v_device.device_id
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW();

  SELECT *
    INTO v_job
    FROM public.sms_tracking_outbox
   WHERE merchant_id = v_device.merchant_id
     AND status IN ('pending', 'retry')
     AND available_at <= NOW()
     AND (
       v_device.operator_code IS NULL
       OR recipient_operator = v_device.operator_code
     )
   ORDER BY available_at ASC, created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('job', NULL, 'operatorCode', v_device.operator_code);
  END IF;

  UPDATE public.sms_tracking_outbox
     SET status = 'processing',
         locked_by = v_device.device_id,
         last_device_id = v_device.device_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 900))),
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE id = v_job.id
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

REVOKE ALL ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER)
  TO service_role;

-- Merchant-owned pause/revoke controls. Revocation converts any active lease
-- to unknown; disabling a line holds it without deleting its credentials.
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
       SET status = 'unknown',
           result_code = 'sender_line_disabled',
           last_error = 'The sender line was disabled while it held this job. Check the delivery outcome before any manual resend.',
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE status = 'processing'
       AND locked_by = p_device_id;
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
BEGIN
  UPDATE public.sms_tracking_outbox
     SET status = 'unknown',
         result_code = 'sender_line_revoked',
         last_error = 'The sender line was revoked while it held this job. Check the delivery outcome before any manual resend.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
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
     AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_native_sms_gateway_device(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_native_sms_gateway_device(UUID, TEXT)
  TO service_role;
