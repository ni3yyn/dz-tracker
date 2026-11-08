-- E-com Delivery v2 merchant API connection, parcel creation and status polling.
-- Uses a separate provider key so it cannot collide with the legacy E-COM v1 carrier.
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

ALTER TABLE public.merchant_carrier_integrations
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE public.merchant_carrier_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_carrier_integrations FROM anon, authenticated;
GRANT ALL ON public.merchant_carrier_integrations TO service_role;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_order_id TEXT,
  ADD COLUMN IF NOT EXISTS carrier_metadata JSONB,
  ADD COLUMN IF NOT EXISTS carrier_last_event_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ecom_v2_orders_to_poll
  ON public.orders (merchant_id, created_at DESC)
  WHERE carrier_name = 'E-com Delivery v2' AND carrier_tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ecom_v2_integrations_sync
  ON public.merchant_carrier_integrations (provider, sync_enabled, updated_at)
  WHERE provider = 'ecom_v2';

CREATE TABLE IF NOT EXISTS public.merchant_carrier_dispatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  attempt_state TEXT NOT NULL CHECK (attempt_state IN ('pending', 'failed', 'uncertain', 'created')),
  request_reference TEXT,
  tracking_number TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_carrier_dispatch_attempts_unique UNIQUE (merchant_id, order_id, provider)
);

ALTER TABLE public.merchant_carrier_dispatch_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_carrier_dispatch_attempts FROM anon, authenticated;
GRANT ALL ON public.merchant_carrier_dispatch_attempts TO service_role;

CREATE INDEX IF NOT EXISTS idx_ecom_v2_dispatch_attempts
  ON public.merchant_carrier_dispatch_attempts (merchant_id, provider, updated_at DESC)
  WHERE provider = 'ecom_v2';
