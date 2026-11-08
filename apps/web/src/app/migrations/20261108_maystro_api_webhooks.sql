-- ============================================================================
-- Maystro API + merchant-configured webhook integration.
-- Maystro notifications are unsigned; each merchant receives a random,
-- unguessable callback URL token. API credentials are AES-GCM encrypted.
-- ============================================================================

-- This shared table is created by the EcoTrack/ZR migrations in most installs;
-- keep this migration self-contained when it is applied first.
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_webhook_token
  ON public.merchant_carrier_integrations (webhook_endpoint_token)
  WHERE webhook_endpoint_token IS NOT NULL;

-- Provider order id is different from the display/tracking number. The metadata
-- snapshot retains destination, totals and Maystro product detail lines which
-- do not have dedicated columns in the common order schema.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_order_id TEXT,
  ADD COLUMN IF NOT EXISTS carrier_metadata JSONB,
  ADD COLUMN IF NOT EXISTS carrier_last_event_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_carrier_order_id
  ON public.orders (merchant_id, carrier_name, carrier_order_id)
  WHERE carrier_order_id IS NOT NULL;

-- Idempotency ledger for Maystro history rows. Maystro has no signed delivery
-- id, so the adapter derives a stable SHA-256 event key from status/time/comment.
CREATE TABLE IF NOT EXISTS public.carrier_order_applied_events (
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'maystro'),
  event_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_order_applied_events_order_time
  ON public.carrier_order_applied_events (order_id, occurred_at);

ALTER TABLE public.carrier_order_applied_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.carrier_order_applied_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.carrier_order_applied_events TO service_role;

-- A single event application transaction:
-- 1) reserves a stable provider history key,
-- 2) inserts the event with Maystro's original timestamp,
-- 3) advances current_status only when the event is not older than the last
--    applied event from that carrier.
-- Older but previously unseen history entries are still inserted into the
-- timeline; they never roll the current order state backwards.
CREATE OR REPLACE FUNCTION public.record_carrier_order_status_change(
  p_order_id UUID,
  p_merchant_id UUID,
  p_provider TEXT,
  p_event_id TEXT,
  p_status_raw TEXT,
  p_status_title TEXT,
  p_description TEXT,
  p_occurred_at TIMESTAMPTZ
)
RETURNS TABLE (changed BOOLEAN, history_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_merchant_id UUID;
  v_last_carrier_event_at TIMESTAMPTZ;
  v_latest_history_at TIMESTAMPTZ;
  v_history_id UUID;
BEGIN
  IF p_provider <> 'maystro' OR NULLIF(p_event_id, '') IS NULL THEN
    RAISE EXCEPTION 'Invalid carrier event identity';
  END IF;

  SELECT merchant_id, carrier_last_event_at
    INTO v_order_merchant_id, v_last_carrier_event_at
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order_merchant_id <> p_merchant_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO public.carrier_order_applied_events (
    merchant_id, provider, event_id, order_id, occurred_at
  )
  VALUES (
    p_merchant_id, p_provider, p_event_id, p_order_id, p_occurred_at
  )
  ON CONFLICT (merchant_id, provider, event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  SELECT MAX(created_at)
    INTO v_latest_history_at
  FROM public.order_history
  WHERE order_id = p_order_id;

  INSERT INTO public.order_history (
    order_id,
    status_raw,
    status_title,
    description,
    event_type,
    created_at
  )
  VALUES (
    p_order_id,
    p_status_raw,
    p_status_title,
    NULLIF(p_description, ''),
    'status_changed',
    p_occurred_at
  )
  RETURNING id INTO v_history_id;

  IF p_occurred_at >= GREATEST(
    COALESCE(v_last_carrier_event_at, '-infinity'::TIMESTAMPTZ),
    COALESCE(v_latest_history_at, '-infinity'::TIMESTAMPTZ)
  ) THEN
    UPDATE public.orders
    SET current_status = p_status_raw,
        carrier_last_event_at = p_occurred_at,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN QUERY SELECT TRUE, v_history_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_carrier_order_status_change(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_carrier_order_status_change(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;
