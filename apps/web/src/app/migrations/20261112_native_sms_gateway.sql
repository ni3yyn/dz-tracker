-- Native, merchant-owned Android SMS devices.
-- Apply after 20261112_android_sms_gateway.sql and 20261112_sms_gateway_admin_manager.sql.
-- The legacy Termux primary device remains separate during the transition.

ALTER TABLE public.sms_gateway_devices
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS token_last_four TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS device_model TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;

ALTER TABLE public.sms_tracking_outbox
  ADD COLUMN IF NOT EXISTS last_device_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_gateway_devices_one_active_merchant
  ON public.sms_gateway_devices (merchant_id)
  WHERE merchant_id IS NOT NULL AND enabled = TRUE AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_gateway_devices_token_hash
  ON public.sms_gateway_devices (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_gateway_devices_merchant
  ON public.sms_gateway_devices (merchant_id, last_seen_at DESC)
  WHERE merchant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_gateway_pairing_codes (
  code_hash TEXT PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_gateway_pairing_codes_expiry
  ON public.sms_gateway_pairing_codes (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.sms_gateway_pairing_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_gateway_pairing_codes FROM anon, authenticated;
GRANT ALL ON public.sms_gateway_pairing_codes TO service_role;

-- A pairing code is consumed and the previous active phone is revoked in the
-- same transaction. The plaintext device token is never stored in PostgreSQL.
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
  store_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_store_name TEXT;
BEGIN
  SELECT pairing.merchant_id
    INTO v_merchant_id
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

  UPDATE public.sms_gateway_pairing_codes
     SET consumed_at = NOW()
   WHERE code_hash = p_code_hash
     AND consumed_at IS NULL;

  -- There is one active sending phone per merchant in the first release.
  UPDATE public.sms_gateway_devices
     SET enabled = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
   WHERE sms_gateway_devices.merchant_id = v_merchant_id
     AND sms_gateway_devices.revoked_at IS NULL;

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
    NOW(),
    NOW(),
    NOW(),
    NOW()
  );

  RETURN QUERY SELECT p_device_id, v_merchant_id, v_store_name;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_native_sms_gateway_pairing(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- Claim only jobs owned by the authenticated device's merchant. The claim
-- transaction also records the last device owner so delayed result callbacks
-- remain scoped even after a lease is converted to "unknown".
CREATE OR REPLACE FUNCTION public.claim_next_sms_tracking_job_for_device(
  p_device_id TEXT,
  p_merchant_id UUID,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS SETOF public.sms_tracking_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
  v_sms_tracking_enabled BOOLEAN;
BEGIN
  SELECT merchant.sms_tracking_enabled
    INTO v_sms_tracking_enabled
    FROM public.merchants AS merchant
   WHERE merchant.id = p_merchant_id;

  IF v_sms_tracking_enabled IS DISTINCT FROM TRUE THEN
    UPDATE public.sms_tracking_outbox
       SET status = 'skipped',
           result_code = 'merchant_sms_disabled',
           last_error = 'SMS tracking was disabled for this merchant before the phone sent the message.',
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE merchant_id = p_merchant_id
       AND status IN ('pending', 'retry');
    RETURN;
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
   WHERE merchant_id = p_merchant_id
     AND status = 'processing'
     AND locked_by = p_device_id
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= NOW();

  SELECT job.id
    INTO v_job_id
    FROM public.sms_tracking_outbox AS job
   WHERE job.merchant_id = p_merchant_id
     AND job.status IN ('pending', 'retry')
     AND job.available_at <= NOW()
   ORDER BY job.available_at ASC, job.created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.sms_tracking_outbox
     SET status = 'processing',
         locked_by = p_device_id,
         last_device_id = p_device_id,
         locked_at = NOW(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 900))),
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE id = v_job_id
     AND merchant_id = p_merchant_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_sms_tracking_job_for_device(TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sms_tracking_job_for_device(TEXT, UUID, INTEGER)
  TO service_role;
