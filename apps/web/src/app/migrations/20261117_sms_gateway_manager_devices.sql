-- Separate merchant-manager authority from SMS sender credentials.
-- Apply after 20261117_native_sms_reliability.sql.
-- The manager phone receives its own control credential plus one carrier-scoped
-- sender credential. Invited phones receive sender credentials only.

CREATE TABLE IF NOT EXISTS public.sms_gateway_manager_pairing_codes (
  code_hash TEXT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  operator_code TEXT NOT NULL CHECK (operator_code IN ('djezzy', 'mobilis', 'ooredoo')),
  replace_existing BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_sms_gateway_manager_pairing_codes_expiry
  ON public.sms_gateway_manager_pairing_codes (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sms_gateway_manager_devices (
  manager_device_id TEXT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Android phone',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  token_hash TEXT NOT NULL UNIQUE,
  token_last_four TEXT,
  primary_sender_device_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_gateway_manager_one_active_per_merchant
  ON public.sms_gateway_manager_devices (merchant_id)
  WHERE enabled = TRUE AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_gateway_manager_devices_merchant
  ON public.sms_gateway_manager_devices (merchant_id, last_seen_at DESC);

ALTER TABLE public.sms_gateway_manager_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_gateway_manager_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_gateway_manager_pairing_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sms_gateway_manager_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_gateway_manager_pairing_codes TO service_role;
GRANT ALL ON public.sms_gateway_manager_devices TO service_role;

ALTER TABLE public.sms_gateway_device_invites
  ADD COLUMN IF NOT EXISTS manager_device_id TEXT
  REFERENCES public.sms_gateway_manager_devices(manager_device_id) ON DELETE SET NULL;

-- The code is created only by the authenticated merchant account. Pairing the
-- manager handset also creates a sender profile for the chosen carrier.
CREATE OR REPLACE FUNCTION public.complete_native_sms_gateway_manager_pairing(
  p_code_hash TEXT,
  p_manager_device_id TEXT,
  p_manager_token_hash TEXT,
  p_manager_token_last_four TEXT,
  p_sender_device_id TEXT,
  p_sender_token_hash TEXT,
  p_token_last_four TEXT,
  p_device_name TEXT,
  p_platform TEXT,
  p_app_version TEXT
)
RETURNS TABLE (
  manager_device_id TEXT,
  sender_device_id TEXT,
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
  v_pairing public.sms_gateway_manager_pairing_codes%ROWTYPE;
  v_store_name TEXT;
  v_owner_user_id UUID;
  v_operator_code TEXT;
  v_has_manager BOOLEAN;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_manager_token_hash IS NULL OR p_manager_token_hash !~ '^[0-9a-f]{64}$'
     OR p_manager_token_last_four IS NULL OR p_manager_token_last_four !~ '^[A-Za-z0-9_-]{4}$'
     OR p_manager_device_id IS NULL OR length(p_manager_device_id) > 80
     OR p_sender_token_hash IS NULL OR p_sender_token_hash !~ '^[0-9a-f]{64}$'
     OR p_sender_device_id IS NULL OR length(p_sender_device_id) > 80 THEN
    RETURN;
  END IF;

  SELECT pairing.*
    INTO v_pairing
    FROM public.sms_gateway_manager_pairing_codes AS pairing
   WHERE pairing.code_hash = p_code_hash
     AND pairing.consumed_at IS NULL
     AND pairing.expires_at > NOW()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Serialize manager replacements and carrier sender-line replacement.
  SELECT merchant.store_name, merchant.auth_user_id
    INTO v_store_name, v_owner_user_id
    FROM public.merchants AS merchant
   WHERE merchant.id = v_pairing.merchant_id
   FOR UPDATE;

  IF v_store_name IS NULL OR v_owner_user_id IS DISTINCT FROM v_pairing.created_by THEN
    RETURN;
  END IF;

  -- A manager code issued before an account suspension must not remain usable.
  IF NOT EXISTS (
    SELECT 1
      FROM auth.users AS account
     WHERE account.id = v_owner_user_id
       AND account.deleted_at IS NULL
       AND (account.banned_until IS NULL OR account.banned_until <= NOW())
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.sms_gateway_manager_devices AS manager
     WHERE manager.merchant_id = v_pairing.merchant_id
       AND manager.revoked_at IS NULL
  ) INTO v_has_manager;

  IF v_has_manager AND v_pairing.replace_existing IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, v_pairing.merchant_id,
      v_store_name, TRUE, v_pairing.operator_code;
    RETURN;
  END IF;

  v_operator_code := v_pairing.operator_code;

  -- An administratively disabled sender slot cannot be bypassed by pairing
  -- another phone. An administrator must explicitly re-enable or revoke it.
  IF EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices AS device
     WHERE device.merchant_id = v_pairing.merchant_id
       AND device.revoked_at IS NULL
       AND device.enabled IS FALSE
       AND (
         device.operator_code = v_operator_code
         OR device.operator_code IS NULL
       )
  ) THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, v_pairing.merchant_id,
      v_store_name, TRUE, v_operator_code;
    RETURN;
  END IF;

  UPDATE public.sms_gateway_manager_pairing_codes
     SET consumed_at = NOW()
   WHERE code_hash = p_code_hash
     AND consumed_at IS NULL;

  -- Replacing the manager revokes its manager credential and its original
  -- sender profile. Other invited sender phones are independent line devices.
  UPDATE public.sms_tracking_outbox AS job
     SET status = 'unknown',
         result_code = 'manager_device_replaced',
         last_error = 'The main TajerTrack Phone was replaced while it held this SMS job. Check the delivery outcome before any manual resend.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         dispatch_started_at = NULL,
         updated_at = NOW()
   WHERE job.merchant_id = v_pairing.merchant_id
     AND job.status = 'processing'
     AND (
       job.locked_by IN (
         SELECT manager.primary_sender_device_id
           FROM public.sms_gateway_manager_devices AS manager
          WHERE manager.merchant_id = v_pairing.merchant_id
            AND manager.revoked_at IS NULL
            AND manager.primary_sender_device_id IS NOT NULL
       )
       OR job.locked_by IN (
         SELECT device.device_id
           FROM public.sms_gateway_devices AS device
          WHERE device.merchant_id = v_pairing.merchant_id
            AND device.revoked_at IS NULL
            AND (device.operator_code = v_operator_code OR device.operator_code IS NULL)
       )
     );

  UPDATE public.sms_gateway_devices AS device
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE device.merchant_id = v_pairing.merchant_id
     AND device.revoked_at IS NULL
     AND (
       device.device_id IN (
         SELECT manager.primary_sender_device_id
           FROM public.sms_gateway_manager_devices AS manager
          WHERE manager.merchant_id = v_pairing.merchant_id
            AND manager.revoked_at IS NULL
            AND manager.primary_sender_device_id IS NOT NULL
       )
       OR device.operator_code = v_operator_code
       OR device.operator_code IS NULL
     );

  UPDATE public.sms_gateway_manager_devices
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE merchant_id = v_pairing.merchant_id
     AND revoked_at IS NULL;

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
    p_sender_device_id,
    LEFT(COALESCE(NULLIF(BTRIM(p_device_name), ''), 'Android phone'), 80),
    v_pairing.merchant_id,
    TRUE,
    p_sender_token_hash,
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

  INSERT INTO public.sms_gateway_manager_devices (
    manager_device_id,
    merchant_id,
    owner_user_id,
    display_name,
    enabled,
    token_hash,
    token_last_four,
    primary_sender_device_id,
    connected_at,
    last_seen_at,
    created_at,
    updated_at
  )
  VALUES (
    p_manager_device_id,
    v_pairing.merchant_id,
    v_pairing.created_by,
    LEFT(COALESCE(NULLIF(BTRIM(p_device_name), ''), 'Android phone'), 80),
    TRUE,
    p_manager_token_hash,
    RIGHT(COALESCE(p_manager_token_last_four, ''), 4),
    p_sender_device_id,
    NOW(),
    NOW(),
    NOW(),
    NOW()
  );

  RETURN QUERY SELECT p_manager_device_id, p_sender_device_id,
    v_pairing.merchant_id, v_store_name, FALSE, v_operator_code;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_native_sms_gateway_manager_pairing(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_native_sms_gateway_manager_pairing(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Invitations created by the manager phone are valid only while that manager
-- credential remains active and the same user still owns the merchant.
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
  v_owner_user_id UUID;
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

  SELECT merchant.store_name, merchant.auth_user_id
    INTO v_store_name, v_owner_user_id
    FROM public.merchants AS merchant
   WHERE merchant.id = v_invite.merchant_id;

  IF v_store_name IS NULL OR v_owner_user_id IS DISTINCT FROM v_invite.created_by THEN
    RETURN;
  END IF;

  -- An invitation cannot be redeemed after the merchant account is banned or deleted.
  IF NOT EXISTS (
    SELECT 1
      FROM auth.users AS account
     WHERE account.id = v_owner_user_id
       AND (account.banned_until IS NULL OR account.banned_until <= NOW())
  ) THEN
    RETURN;
  END IF;

  IF v_invite.manager_device_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.sms_gateway_manager_devices AS manager
     WHERE manager.manager_device_id = v_invite.manager_device_id
       AND manager.merchant_id = v_invite.merchant_id
       AND manager.owner_user_id = v_invite.created_by
       AND manager.enabled IS TRUE
       AND manager.revoked_at IS NULL
  ) THEN
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


-- Revalidate the merchant account in both the queue-claim and final dispatch
-- transactions. A previously invited sender must stop working if the merchant
-- account is banned or deleted, even if its sender token is still locally stored.

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
  v_account_active BOOLEAN;
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

  SELECT merchant.sms_tracking_enabled,
         EXISTS (
           SELECT 1
             FROM auth.users AS account
            WHERE account.id = merchant.auth_user_id
              AND account.deleted_at IS NULL
              AND (account.banned_until IS NULL OR account.banned_until <= NOW())
         )
    INTO v_sms_enabled, v_account_active
    FROM public.merchants AS merchant
   WHERE merchant.id = v_device.merchant_id;

  -- Account suspension/deletion blocks every sender device, not only the
  -- manager credential. Queued jobs are retained; no SMS is dispatched.
  IF v_account_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('merchantDisabled', TRUE, 'accountDisabled', TRUE);
  END IF;

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
  v_device_enabled BOOLEAN;
  v_sms_enabled BOOLEAN;
  v_account_active BOOLEAN;
  v_gateway_enabled BOOLEAN;
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

  SELECT device.enabled
    INTO v_device_enabled
    FROM public.sms_gateway_devices AS device
   WHERE device.device_id = p_device_id
     AND device.merchant_id = p_merchant_id
     AND device.revoked_at IS NULL;

  SELECT merchant.sms_tracking_enabled,
         EXISTS (
           SELECT 1
             FROM auth.users AS account
            WHERE account.id = merchant.auth_user_id
              AND account.deleted_at IS NULL
              AND (account.banned_until IS NULL OR account.banned_until <= NOW())
         )
    INTO v_sms_enabled, v_account_active
    FROM public.merchants AS merchant
   WHERE merchant.id = p_merchant_id;

  SELECT control.enabled
    INTO v_gateway_enabled
    FROM public.sms_gateway_control AS control
   WHERE control.id = 'primary';

  IF v_device_enabled IS DISTINCT FROM TRUE
     OR v_sms_enabled IS DISTINCT FROM TRUE
     OR v_account_active IS DISTINCT FROM TRUE
     OR v_gateway_enabled IS DISTINCT FROM TRUE THEN
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
     AND dispatch_started_at IS NULL
     AND expires_at > NOW();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_native_sms_job_dispatch(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_native_sms_job_dispatch(UUID, UUID, TEXT, UUID)
  TO service_role;

