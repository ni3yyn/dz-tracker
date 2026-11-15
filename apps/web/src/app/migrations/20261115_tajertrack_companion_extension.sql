-- TajerTrack Companion: cryptographically paired browser installs and short-lived Guepex identity captures.
-- All tables are service-role only. The extension never receives carrier API credentials or webhook secrets.

CREATE TABLE IF NOT EXISTS public.merchant_companion_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL UNIQUE,
  public_key JSONB NOT NULL,
  extension_version TEXT,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_companion_devices_merchant_active
  ON public.merchant_companion_devices (merchant_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.merchant_companion_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_companion_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_companion_devices TO service_role;

CREATE TABLE IF NOT EXISTS public.merchant_companion_pairing_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_companion_challenge_hash_unique UNIQUE (challenge_hash)
);

CREATE INDEX IF NOT EXISTS idx_merchant_companion_challenges_pending
  ON public.merchant_companion_pairing_challenges (merchant_id, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.merchant_companion_pairing_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_companion_pairing_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_companion_pairing_challenges TO service_role;

CREATE TABLE IF NOT EXISTS public.yalidine_companion_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL REFERENCES public.merchant_companion_devices(installation_id) ON DELETE CASCADE,
  external_order_id TEXT NOT NULL,
  tracking_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  product_name TEXT,
  captured_at TIMESTAMPTZ,
  capture_nonce TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  CONSTRAINT yalidine_companion_capture_nonce_unique UNIQUE (installation_id, capture_nonce),
  CONSTRAINT yalidine_companion_capture_hash_unique UNIQUE (merchant_id, payload_hash),
  CONSTRAINT yalidine_companion_capture_identity_check CHECK (
    customer_name IS NOT NULL OR customer_phone IS NOT NULL
  ),
  CONSTRAINT yalidine_companion_capture_phone_check CHECK (
    customer_phone IS NULL OR (customer_phone !~ '[*]' AND length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) >= 8)
  )
);

CREATE INDEX IF NOT EXISTS idx_yalidine_companion_captures_pending
  ON public.yalidine_companion_captures (merchant_id, external_order_id, expires_at, received_at);

ALTER TABLE public.yalidine_companion_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.yalidine_companion_captures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.yalidine_companion_captures TO service_role;

COMMENT ON TABLE public.yalidine_companion_captures IS
  'Short-lived pending identity captured from a merchant-authorized Guepex/Yalidine parcel creation request. Rows are deleted after matching or expire after seven days.';


-- Prevent replay of a signed browser presence proof across multiple API/Webhook pairing actions.
CREATE TABLE IF NOT EXISTS public.merchant_companion_proof_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES public.merchant_companion_devices(installation_id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('status', 'prepare-webhook', 'save-api', 'save-webhook')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_companion_proof_nonce_unique UNIQUE (installation_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_merchant_companion_proof_nonces_expiry
  ON public.merchant_companion_proof_nonces (expires_at);

ALTER TABLE public.merchant_companion_proof_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_companion_proof_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_companion_proof_nonces TO service_role;
