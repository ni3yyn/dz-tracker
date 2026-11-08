-- ============================================================================
-- Yalidine / Guepex signed webhook ingestion.
-- Each merchant has a unique callback token and encrypted webhook HMAC secret.
-- The public receiver verifies CRC + raw-body HMAC, then persists events for
-- the Railway worker. No courier payload is processed in the HTTP request.
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

ALTER TABLE public.merchant_carrier_integrations
  ADD COLUMN IF NOT EXISTS webhook_endpoint_token TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_processed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_yalidine_webhook_token
  ON public.merchant_carrier_integrations (webhook_endpoint_token)
  WHERE webhook_endpoint_token IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_last_event_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.yalidine_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'parcel_created',
      'parcel_edited',
      'parcel_deleted',
      'parcel_status_updated',
      'parcel_payment_updated'
    )
  ),
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT yalidine_webhook_events_merchant_event_unique UNIQUE (merchant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_yalidine_webhook_events_queue
  ON public.yalidine_webhook_events (occurred_at ASC, received_at ASC)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_yalidine_webhook_events_lease
  ON public.yalidine_webhook_events (lease_expires_at)
  WHERE status = 'processing';

ALTER TABLE public.yalidine_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.yalidine_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.yalidine_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_next_yalidine_webhook_event(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 180
)
RETURNS SETOF public.yalidine_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT id INTO v_event_id
  FROM public.yalidine_webhook_events
  WHERE (
    (status IN ('pending', 'retry') AND available_at <= NOW())
    OR (status = 'processing' AND lease_expires_at < NOW())
  )
  ORDER BY occurred_at ASC, received_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.yalidine_webhook_events
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = NOW(),
      lease_expires_at = NOW() + make_interval(secs => GREATEST(10, p_lease_seconds)),
      attempt_count = attempt_count + 1,
      updated_at = NOW()
  WHERE id = v_event_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_yalidine_webhook_event(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_yalidine_webhook_event(TEXT, INTEGER)
  TO service_role;
