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


-- Ordered history RPC is also used by other carrier API pollers. Keep this migration
-- self-contained when the ZR Express migration has not yet been applied.
CREATE TABLE IF NOT EXISTS public.zrexpress_webhook_applied_events (
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  svix_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, svix_id)
);

ALTER TABLE public.zrexpress_webhook_applied_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zrexpress_webhook_applied_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.zrexpress_webhook_applied_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_order_status_change_ordered(
  p_order_id UUID,
  p_status_raw TEXT,
  p_status_title TEXT,
  p_description TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_source_event_id TEXT DEFAULT NULL
)
RETURNS TABLE (changed BOOLEAN, history_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carrier_event_at TIMESTAMPTZ;
  v_latest_history_at TIMESTAMPTZ;
  v_history_id UUID;
  v_merchant_id UUID;
BEGIN
  SELECT merchant_id, carrier_last_event_at
    INTO v_merchant_id, v_carrier_event_at
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  IF p_source_event_id IS NOT NULL THEN
    INSERT INTO public.zrexpress_webhook_applied_events (merchant_id, svix_id, order_id, occurred_at)
    VALUES (v_merchant_id, p_source_event_id, p_order_id, p_occurred_at)
    ON CONFLICT (merchant_id, svix_id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_history
    WHERE order_id = p_order_id
      AND created_at = p_occurred_at
      AND status_raw = p_status_raw
      AND status_title = p_status_title
      AND event_type = 'order_created'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  SELECT MAX(created_at)
    INTO v_latest_history_at
  FROM public.order_history
  WHERE order_id = p_order_id;

  IF p_occurred_at < GREATEST(
    COALESCE(v_carrier_event_at, '-infinity'::TIMESTAMPTZ),
    COALESCE(v_latest_history_at, '-infinity'::TIMESTAMPTZ)
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  UPDATE public.orders
  SET current_status = p_status_raw,
      carrier_last_event_at = GREATEST(
        COALESCE(carrier_last_event_at, '-infinity'::TIMESTAMPTZ),
        p_occurred_at
      ),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.order_history (
    order_id, status_raw, status_title, description, event_type, created_at
  )
  VALUES (
    p_order_id, p_status_raw, p_status_title, NULLIF(p_description, ''),
    'status_changed', p_occurred_at
  )
  RETURNING id INTO v_history_id;

  RETURN QUERY SELECT TRUE, v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_status_change_ordered(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_status_change_ordered(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;
