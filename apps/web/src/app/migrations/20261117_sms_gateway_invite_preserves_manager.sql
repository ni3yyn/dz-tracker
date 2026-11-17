-- Preserve the carrier-neutral manager sender profile when a carrier-scoped
-- invitation is redeemed. Sender replacement must match the exact carrier;
-- NULL (the main manager profile) is not the same slot as Ooredoo/Mobilis/Djezzy.

CREATE OR REPLACE FUNCTION public.complete_native_sms_gateway_pairing(p_code_hash text, p_device_id text, p_token_hash text, p_token_last_four text, p_device_name text, p_platform text, p_app_version text)
 RETURNS TABLE(device_id text, merchant_id uuid, store_name text, blocked boolean, operator_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Serialize all line-pairing operations for this merchant. Pairing codes
  -- are individually locked above, but different carrier invites must not
  -- race each other while replacing or creating a carrier slot.
  PERFORM 1
    FROM public.merchants AS merchant
   WHERE merchant.id = v_merchant_id
   FOR UPDATE;

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
            AND device.operator_code IS NOT DISTINCT FROM v_operator_code
       )
     );

  UPDATE public.sms_gateway_devices AS device
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE device.merchant_id = v_merchant_id
     AND device.revoked_at IS NULL
     AND device.operator_code IS NOT DISTINCT FROM v_operator_code;

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
$function$
;

REVOKE ALL ON FUNCTION public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
