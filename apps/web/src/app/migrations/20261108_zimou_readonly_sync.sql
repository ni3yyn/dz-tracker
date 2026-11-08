-- Zimou Express read-only API status synchronization.
CREATE TABLE IF NOT EXISTS public.merchant_carrier_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_carrier_integrations_merchant_provider_unique UNIQUE (merchant_id, provider)
);
ALTER TABLE public.merchant_carrier_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_carrier_integrations FROM anon, authenticated;
GRANT ALL ON public.merchant_carrier_integrations TO service_role;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_metadata JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_last_event_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_zimou_orders_to_poll
  ON public.orders (merchant_id, created_at DESC)
  WHERE carrier_name = 'Zimou Express' AND carrier_tracking_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zimou_integrations_sync
  ON public.merchant_carrier_integrations (provider, sync_enabled, updated_at)
  WHERE provider = 'zimou';
