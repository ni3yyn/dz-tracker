-- A neutral main-phone SIM may cover operators without an enabled dedicated sender.
-- Dedicated carrier lines always win; the main phone first polls on-net, then
-- performs one explicit cross-network fallback pass to avoid pre-empting another
-- enabled SIM on a dual-SIM manager phone.
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.poll_native_sms_gateway(TEXT, TEXT, INTEGER);

CREATE FUNCTION public.poll_native_sms_gateway(
  p_token_hash TEXT,
  p_app_version TEXT DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 300,
  p_dispatch_protocol BOOLEAN DEFAULT FALSE,
  p_operator_code TEXT DEFAULT NULL,
  p_allow_cross_network_fallback BOOLEAN DEFAULT FALSE
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
     AND (
       (
         v_device.operator_code IS NOT NULL
         AND job.recipient_operator = v_device.operator_code
       )
       OR (
         v_device.operator_code IS NULL
         AND (
           job.recipient_operator = v_effective_operator_code
           OR p_allow_cross_network_fallback IS TRUE
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.sms_gateway_devices AS dedicated
            WHERE dedicated.merchant_id = v_device.merchant_id
              AND dedicated.operator_code = job.recipient_operator
              AND dedicated.enabled IS TRUE
              AND dedicated.revoked_at IS NULL
         )
       )
     )
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
    'operatorCode', v_effective_operator_code,
    'crossNetworkFallback', (
      v_device.operator_code IS NULL
      AND v_job.recipient_operator <> v_effective_operator_code
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.poll_native_sms_gateway(TEXT, TEXT, INTEGER, BOOLEAN, TEXT, BOOLEAN)
  TO service_role;

NOTIFY pgrst, 'reload schema';
