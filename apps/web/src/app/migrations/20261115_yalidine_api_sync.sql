-- Guepex / Yalidine read-only API reconciliation.
-- API credentials share the existing AES-GCM encrypted credential envelope;
-- the plaintext ID and token are never stored in separate columns.

ALTER TABLE public.merchant_carrier_integrations
  ADD COLUMN IF NOT EXISTS api_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_api_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_last_error TEXT,
  ADD COLUMN IF NOT EXISTS api_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_sync_locked_by TEXT,
  ADD COLUMN IF NOT EXISTS api_sync_lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_yalidine_api_sync
  ON public.merchant_carrier_integrations (updated_at)
  WHERE provider = 'yalidine' AND api_sync_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_yalidine_api_lease
  ON public.merchant_carrier_integrations (api_sync_lease_expires_at)
  WHERE provider = 'yalidine'
    AND api_sync_enabled = TRUE
    AND api_sync_locked_by IS NOT NULL;

COMMENT ON COLUMN public.merchant_carrier_integrations.api_sync_enabled IS
  'Enables read-only account parcel reconciliation through the Guepex API for Yalidine.';
COMMENT ON COLUMN public.merchant_carrier_integrations.last_api_sync_at IS
  'Timestamp of the last fully completed Guepex API parcel reconciliation cycle.';
COMMENT ON COLUMN public.merchant_carrier_integrations.api_last_error IS
  'Most recent Guepex API reconciliation error, with API credentials redacted.';

COMMENT ON COLUMN public.merchant_carrier_integrations.api_sync_locked_by IS
  'Unique push-worker instance holding the current Guepex API synchronization lease.';
COMMENT ON COLUMN public.merchant_carrier_integrations.api_sync_lease_expires_at IS
  'Expiry for the per-merchant Guepex API synchronization lease, preventing duplicate polling across worker replicas.';
