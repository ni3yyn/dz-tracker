-- ============================================================================
-- TajerTrack: EcoTrack read-only account integration and shipment sync.
-- Stores the courier token encrypted by the application. The service role is
-- the only database role allowed to read or write these credentials.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_carrier_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    credentials_encrypted TEXT NOT NULL,
    sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_orders_scan_at TIMESTAMPTZ,
    last_status_sync_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT merchant_carrier_integrations_merchant_provider_unique UNIQUE (merchant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_sync
    ON public.merchant_carrier_integrations (provider, sync_enabled, updated_at);

ALTER TABLE public.merchant_carrier_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_carrier_integrations FROM anon, authenticated;
GRANT ALL ON public.merchant_carrier_integrations TO service_role;
