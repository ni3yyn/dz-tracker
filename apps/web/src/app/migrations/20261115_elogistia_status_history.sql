-- Elogistia-only ordered status-history persistence.
-- This keeps Elogistia polling independent from the ZR Express/Yalidine SQL migrations.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_last_event_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.elogistia_order_applied_events (
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_elogistia_order_applied_events_order_time
  ON public.elogistia_order_applied_events (order_id, occurred_at);

ALTER TABLE public.elogistia_order_applied_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elogistia_order_applied_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.elogistia_order_applied_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_elogistia_order_status_change(
  p_order_id UUID,
  p_merchant_id UUID,
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
  v_carrier_event_at TIMESTAMPTZ;
  v_latest_history_at TIMESTAMPTZ;
  v_history_id UUID;
BEGIN
  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Elogistia status event is missing its provider timestamp';
  END IF;

  SELECT merchant_id, carrier_last_event_at
    INTO v_order_merchant_id, v_carrier_event_at
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order_merchant_id <> p_merchant_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  IF NULLIF(p_event_id, '') IS NOT NULL THEN
    INSERT INTO public.elogistia_order_applied_events (
      merchant_id, event_id, order_id, occurred_at
    )
    VALUES (
      p_merchant_id, p_event_id, p_order_id, p_occurred_at
    )
    ON CONFLICT (merchant_id, event_id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- Do not duplicate the original order-created row if an import retry carries
  -- the same provider timestamp and status.
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

  -- Stale history is ignored so it cannot roll current_status backwards.
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

  RETURN QUERY SELECT TRUE, v_history_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_elogistia_order_status_change(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_elogistia_order_status_change(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;
