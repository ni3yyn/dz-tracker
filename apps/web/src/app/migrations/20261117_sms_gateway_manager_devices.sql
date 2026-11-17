-- Separate merchant-manager authority from SMS sender credentials.
-- Apply after 20261116_sms_carrier_routing.sql.
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
     OR p_sender_token_hash IS NULL OR p_sender_token_hash !~ '^[0-9a-f]{64}$'
     OR p_manager_device_id IS NULL OR length(p_manager_device_id) > 80
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
    RIGHT(COALESCE(p_token_last_four, ''), 4),
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
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_native_sms_gateway_manager_pairing(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
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
