-- Manual, merchant-requested Guepex refreshes are consumed by the existing Railway push worker.
ALTER TABLE public.merchant_carrier_integrations
  ADD COLUMN IF NOT EXISTS api_sync_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_yalidine_api_requested
  ON public.merchant_carrier_integrations (api_sync_requested_at)
  WHERE provider = 'yalidine'
    AND api_sync_enabled = TRUE
    AND api_sync_requested_at IS NOT NULL;

COMMENT ON COLUMN public.merchant_carrier_integrations.api_sync_requested_at IS
  'A merchant-requested immediate Guepex API refresh awaiting or currently being handled by the Railway worker.';
