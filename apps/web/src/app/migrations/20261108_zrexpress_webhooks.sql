-- ============================================================================
-- ZR Express modern Supplier API webhook integration.
-- Keeps legacy Procolis payload handling separate.
-- Credentials are encrypted and accessible only to service_role.
-- ============================================================================

ALTER TABLE public.merchant_carrier_integrations
  ADD COLUMN IF NOT EXISTS webhook_endpoint_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_endpoint_token TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_processed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_carrier_integrations_zr_endpoint_token
  ON public.merchant_carrier_integrations (webhook_endpoint_token)
  WHERE webhook_endpoint_token IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier_last_event_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.zrexpress_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  svix_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'parcel.state.updated',
      'parcel.state.situation.created',
      'parcel.isReturn.updated'
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
  CONSTRAINT zrexpress_webhook_events_merchant_svix_unique UNIQUE (merchant_id, svix_id)
);

CREATE INDEX IF NOT EXISTS idx_zrexpress_webhook_events_queue
  ON public.zrexpress_webhook_events (occurred_at ASC, received_at ASC)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_zrexpress_webhook_events_lease
  ON public.zrexpress_webhook_events (lease_expires_at)
  WHERE status = 'processing';

ALTER TABLE public.zrexpress_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zrexpress_webhook_events FROM anon, authenticated;
GRANT ALL ON public.zrexpress_webhook_events TO service_role;

-- Claim one verified event at a time. SKIP LOCKED allows multiple Railway
-- worker replicas without claiming the same delivery concurrently.
CREATE OR REPLACE FUNCTION public.claim_next_zrexpress_webhook_event(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 90
)
RETURNS SETOF public.zrexpress_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  SELECT id INTO v_event_id
  FROM public.zrexpress_webhook_events
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
  UPDATE public.zrexpress_webhook_events
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

REVOKE ALL ON FUNCTION public.claim_next_zrexpress_webhook_event(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_zrexpress_webhook_event(TEXT, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.zrexpress_webhook_applied_events (
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  svix_id TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, svix_id)
);

ALTER TABLE public.zrexpress_webhook_applied_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zrexpress_webhook_applied_events FROM anon, authenticated;
GRANT ALL ON public.zrexpress_webhook_applied_events TO service_role;

-- Atomically apply an event only when it is not older than the latest known
-- order timeline entry. This protects against Svix retries/reordering and
-- concurrent Railway worker replicas. Each distinct signed provider event
-- still gets its own timeline row, including same-category situation events.
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



  IF p_occurred_at <= COALESCE(v_carrier_event_at, '-infinity'::TIMESTAMPTZ) THEN
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

REVOKE ALL ON FUNCTION public.record_order_status_change_ordered(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_status_change_ordered(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;
