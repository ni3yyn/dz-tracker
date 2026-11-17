-- Carrier-neutral main-phone pairing and per-SIM queue polling.
-- Apply after 20261117_sms_gateway_manager_devices.sql.
-- The manager phone is not bound to the SIM used during account registration
-- or browser pairing. Android supplies the active SIM's detected carrier on
-- each poll, allowing one dual-SIM phone to serve both supported networks.

ALTER TABLE public.sms_gateway_manager_pairing_codes
  ALTER COLUMN operator_code DROP NOT NULL;

-- Remove older overloads. Keeping the 3/4-argument versions would make
-- PostgREST RPC discovery ambiguous after the per-SIM argument is introduced.
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER);

-- The main phone owns a carrier-neutral sender profile (operator_code NULL).
-- A manager replacement revokes only the old main phone's sender credential;
-- separately invited, carrier-scoped sender phones remain independent.
DROP FUNCTION IF EXISTS public.complete_native_sms_gateway_manager_pairing(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE FUNCTION public.complete_native_sms_gateway_manager_pairing(
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
  block_reason TEXT,
  failure_code TEXT,
  operator_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_pairing public.sms_gateway_manager_pairing_codes%ROWTYPE;
  v_store_name TEXT;
  v_owner_user_id UUID;
  v_has_manager BOOLEAN;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_manager_token_hash IS NULL OR p_manager_token_hash !~ '^[0-9a-f]{64}$'
     OR p_manager_token_last_four IS NULL OR p_manager_token_last_four !~ '^[A-Za-z0-9_-]{4}$'
     OR p_sender_token_hash IS NULL OR p_sender_token_hash !~ '^[0-9a-f]{64}$'
     OR p_token_last_four IS NULL OR p_token_last_four !~ '^[A-Za-z0-9_-]{4}$'
     OR p_manager_device_id IS NULL OR length(p_manager_device_id) > 80
     OR p_sender_device_id IS NULL OR length(p_sender_device_id) > 80 THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT,
      FALSE, NULL::TEXT, 'invalid_pairing_request'::TEXT, NULL::TEXT;
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
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::UUID, NULL::TEXT,
      FALSE, NULL::TEXT, 'pairing_code_expired_or_used'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT merchant.store_name, merchant.auth_user_id
    INTO v_store_name, v_owner_user_id
    FROM public.merchants AS merchant
   WHERE merchant.id = v_pairing.merchant_id
   FOR UPDATE;

  IF v_store_name IS NULL OR v_owner_user_id IS DISTINCT FROM v_pairing.created_by THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, v_pairing.merchant_id, NULL::TEXT,
      FALSE, NULL::TEXT, 'merchant_owner_mismatch'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM auth.users AS account
     WHERE account.id = v_owner_user_id
       AND account.deleted_at IS NULL
       AND (account.banned_until IS NULL OR account.banned_until <= NOW())
  ) THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, v_pairing.merchant_id, v_store_name,
      FALSE, NULL::TEXT, 'merchant_account_inactive'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.sms_gateway_manager_devices AS active_manager
     WHERE active_manager.merchant_id = v_pairing.merchant_id
       AND active_manager.revoked_at IS NULL
  ) INTO v_has_manager;

  IF v_has_manager AND v_pairing.replace_existing IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, v_pairing.merchant_id, v_store_name,
      TRUE, 'manager_replacement_required'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.sms_gateway_manager_pairing_codes AS pairing
     SET consumed_at = NOW()
   WHERE pairing.code_hash = p_code_hash
     AND pairing.consumed_at IS NULL;

  -- A replacement must not turn an uncertain send into an automatic resend.
  -- Pre-dispatch claims are retryable; post-dispatch claims remain unknown.
  UPDATE public.sms_tracking_outbox AS job
     SET status = CASE
           WHEN job.dispatch_started_at IS NULL AND job.expires_at > NOW() THEN 'retry'
           WHEN job.dispatch_started_at IS NULL THEN 'expired'
           ELSE 'unknown'
         END,
         available_at = CASE
           WHEN job.dispatch_started_at IS NULL THEN NOW()
           ELSE job.available_at
         END,
         result_code = CASE
           WHEN job.dispatch_started_at IS NULL AND job.expires_at > NOW()
             THEN 'manager_replaced_before_dispatch'
           WHEN job.dispatch_started_at IS NULL
             THEN 'order_sms_window_expired_before_dispatch'
           ELSE 'manager_replaced_after_dispatch_started'
         END,
         last_error = CASE
           WHEN job.dispatch_started_at IS NULL AND job.expires_at > NOW()
             THEN 'The main phone was replaced before Android dispatch began. The SMS remains queued for another authorized sender.'
           WHEN job.dispatch_started_at IS NULL
             THEN 'The order SMS window expired before Android dispatch began.'
           ELSE 'The main phone was replaced after SMS dispatch began. The SMS may have been sent; verify the result before any manual resend.'
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = CASE
           WHEN job.dispatch_started_at IS NULL THEN NULL
           ELSE job.claim_token
         END,
         updated_at = NOW()
   WHERE job.merchant_id = v_pairing.merchant_id
     AND job.status = 'processing'
     AND job.locked_by IN (
       SELECT active_manager.primary_sender_device_id
         FROM public.sms_gateway_manager_devices AS active_manager
        WHERE active_manager.merchant_id = v_pairing.merchant_id
          AND active_manager.revoked_at IS NULL
          AND active_manager.primary_sender_device_id IS NOT NULL
       UNION
       SELECT old_sender.device_id
         FROM public.sms_gateway_devices AS old_sender
        WHERE old_sender.merchant_id = v_pairing.merchant_id
          AND old_sender.operator_code IS NULL
          AND old_sender.revoked_at IS NULL
     );

  -- Revoke the old manager's own sender profile and any legacy unscoped sender
  -- before inserting the new neutral profile. Carrier-scoped invitees survive.
  UPDATE public.sms_gateway_devices AS old_sender
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE old_sender.merchant_id = v_pairing.merchant_id
     AND old_sender.revoked_at IS NULL
     AND (
       old_sender.operator_code IS NULL
       OR old_sender.device_id IN (
         SELECT active_manager.primary_sender_device_id
           FROM public.sms_gateway_manager_devices AS active_manager
          WHERE active_manager.merchant_id = v_pairing.merchant_id
            AND active_manager.revoked_at IS NULL
            AND active_manager.primary_sender_device_id IS NOT NULL
       )
     );

  -- Qualify merchant_id: it is also an OUT column of this RETURNS TABLE
  -- function, so an unqualified reference is ambiguous in PL/pgSQL.
  UPDATE public.sms_gateway_manager_devices AS active_manager
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE active_manager.merchant_id = v_pairing.merchant_id
     AND active_manager.revoked_at IS NULL;

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
    RIGHT(p_token_last_four, 4),
    LEFT(COALESCE(NULLIF(BTRIM(p_platform), ''), 'android'), 24),
    LEFT(COALESCE(NULLIF(BTRIM(p_app_version), ''), 'unknown'), 32),
    LEFT(COALESCE(NULLIF(BTRIM(p_device_name), ''), 'Android phone'), 80),
    NULL,
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
    RIGHT(p_manager_token_last_four, 4),
    p_sender_device_id,
    NOW(),
    NOW(),
    NOW(),
    NOW()
  );

  RETURN QUERY SELECT p_manager_device_id, p_sender_device_id,
    v_pairing.merchant_id, v_store_name, FALSE, NULL::TEXT, NULL::TEXT, NULL::TEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_native_sms_gateway_manager_pairing(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_native_sms_gateway_manager_pairing(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Claim only for the carrier selected in Android for this poll. A fixed
-- carrier-specific invite cannot change carrier; a neutral manager credential
-- may poll for either enabled SIM while preserving exact recipient routing.
CREATE FUNCTION public.poll_native_sms_gateway(
  p_token_hash TEXT,
  p_app_version TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 300,
  p_dispatch_protocol BOOLEAN DEFAULT FALSE,
  p_operator_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_device public.sms_gateway_devices%ROWTYPE;
  v_global_enabled BOOLEAN;
  v_sms_enabled BOOLEAN;
  v_account_active BOOLEAN;
  v_claim_token UUID;
  v_effective_operator_code TEXT;
  v_job public.sms_tracking_outbox%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('errorCode', 'unauthorized');
  END IF;

  IF p_operator_code IS NOT NULL
     AND p_operator_code NOT IN ('djezzy', 'mobilis', 'ooredoo') THEN
    RETURN jsonb_build_object('operatorInvalid', TRUE);
  END IF;

  SELECT *
    INTO v_device
    FROM public.sms_gateway_devices AS device
   WHERE device.token_hash = p_token_hash
     AND device.merchant_id IS NOT NULL
     AND device.revoked_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('errorCode', 'unauthorized');
  END IF;

  UPDATE public.sms_gateway_devices AS device
     SET last_seen_at = NOW(),
         app_version = CASE
           WHEN p_app_version IS NULL OR BTRIM(p_app_version) = '' THEN device.app_version
           ELSE LEFT(BTRIM(p_app_version), 32)
         END,
         updated_at = NOW()
   WHERE device.device_id = v_device.device_id
  RETURNING * INTO v_device;

  UPDATE public.sms_tracking_outbox AS job
     SET status = 'expired',
         result_code = 'order_sms_window_expired',
         last_error = 'The order tracking SMS was not submitted within 72 hours of order creation.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE job.merchant_id = v_device.merchant_id
     AND job.status IN ('pending', 'retry')
     AND job.expires_at <= NOW();

  UPDATE public.sms_tracking_outbox AS job
     SET status = 'expired',
         result_code = 'order_sms_window_expired_before_dispatch',
         last_error = 'The 72-hour window elapsed before Android began submitting this SMS.',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE job.merchant_id = v_device.merchant_id
     AND job.status = 'processing'
     AND job.dispatch_started_at IS NULL
     AND job.expires_at <= NOW();

  -- Recover abandoned claims conservatively; never duplicate a message whose
  -- Android dispatch may already have started.
  UPDATE public.sms_tracking_outbox AS job
     SET status = CASE
           WHEN job.dispatch_started_at IS NULL THEN 'retry'
           ELSE 'unknown'
         END,
         available_at = CASE
           WHEN job.dispatch_started_at IS NULL THEN NOW() + INTERVAL '15 seconds'
           ELSE job.available_at
         END,
         result_code = CASE
           WHEN job.dispatch_started_at IS NULL THEN 'claim_lease_expired_before_dispatch'
           ELSE 'dispatch_lease_expired_result_unknown'
         END,
         last_error = CASE
           WHEN job.dispatch_started_at IS NULL
             THEN 'The phone did not finish preparing the SMS. No SMS dispatch was started; the job was returned to the queue.'
           ELSE 'The phone stopped reporting after SMS dispatch began. The SMS may have been sent; no automatic duplicate was attempted.'
         END,
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = CASE WHEN job.dispatch_started_at IS NULL THEN NULL ELSE job.claim_token END,
         updated_at = NOW()
   WHERE job.merchant_id = v_device.merchant_id
     AND job.status = 'processing'
     AND job.locked_by = v_device.device_id
     AND job.lease_expires_at IS NOT NULL
     AND job.lease_expires_at <= NOW();

  IF v_device.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('deviceDisabled', TRUE);
  END IF;

  SELECT control.enabled
    INTO v_global_enabled
    FROM public.sms_gateway_control AS control
   WHERE control.id = 'primary';

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

  IF v_account_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('merchantDisabled', TRUE, 'accountDisabled', TRUE);
  END IF;

  IF v_sms_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('merchantDisabled', TRUE);
  END IF;

  IF v_device.operator_code IS NOT NULL THEN
    IF p_operator_code IS NOT NULL AND p_operator_code <> v_device.operator_code THEN
      RETURN jsonb_build_object('operatorConflict', TRUE);
    END IF;
    v_effective_operator_code := v_device.operator_code;
  ELSE
    v_effective_operator_code := p_operator_code;
  END IF;

  IF v_effective_operator_code IS NULL THEN
    RETURN jsonb_build_object('operatorUnassigned', TRUE);
  END IF;

  SELECT job.id
    INTO v_job.id
    FROM public.sms_tracking_outbox AS job
   WHERE job.merchant_id = v_device.merchant_id
     AND job.status IN ('pending', 'retry')
     AND job.available_at <= NOW()
     AND job.expires_at > NOW()
     AND job.recipient_operator = v_effective_operator_code
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
    RETURN jsonb_build_object('job', NULL, 'operatorCode', v_effective_operator_code);
  END IF;

  v_claim_token := gen_random_uuid();

  UPDATE public.sms_tracking_outbox AS job
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
         attempt_count = job.attempt_count + CASE
           WHEN p_dispatch_protocol THEN 0
           ELSE 1
         END,
         updated_at = NOW()
   WHERE job.id = v_job.id
     AND job.merchant_id = v_device.merchant_id
  RETURNING job.* INTO v_job;

  UPDATE public.sms_gateway_devices AS device
     SET last_claim_at = NOW(),
         updated_at = NOW()
   WHERE device.device_id = v_device.device_id;

  RETURN jsonb_build_object(
    'job', to_jsonb(v_job),
    'deviceId', v_device.device_id,
    'merchantId', v_device.merchant_id,
    'operatorCode', v_effective_operator_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.poll_native_sms_gateway(
  TEXT, TEXT, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_native_sms_gateway(
  TEXT, TEXT, INTEGER, BOOLEAN, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
