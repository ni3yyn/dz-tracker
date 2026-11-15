-- Guepex / Yalidine read-only API reconciliation.
-- API credentials share the existing AES-GCM encrypted credential envelope;
-- the plaintext ID and token are never stored in separate columns.

ALTER TABLE public.merchant_carrier_integrations
  ADD COLUMN IF NOT EXISTS api_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_api_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_last_error TEXT,
  ADD COLUMN IF NOT EXISTS api_last_error_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_yalidine_api_sync
  ON public.merchant_carrier_integrations (updated_at)
  WHERE provider = 'yalidine' AND api_sync_enabled = TRUE;

COMMENT ON COLUMN public.merchant_carrier_integrations.api_sync_enabled IS
  'Enables read-only account parcel reconciliation through the Guepex API for Yalidine.';
COMMENT ON COLUMN public.merchant_carrier_integrations.last_api_sync_at IS
  'Timestamp of the last fully completed Guepex API parcel reconciliation cycle.';
COMMENT ON COLUMN public.merchant_carrier_integrations.api_last_error IS
  'Most recent Guepex API reconciliation error, with API credentials redacted.';
