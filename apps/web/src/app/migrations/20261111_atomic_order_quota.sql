-- TajerTrack: atomic order quota enforcement and exact usage reconciliation.
-- Apply after the existing merchant/orders schema and the current integration migrations.

-- One row for every accepted new order. The row survives order deletion so
-- deleting old orders cannot be used to repeatedly refill a monthly quota.
CREATE TABLE IF NOT EXISTS public.merchant_order_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  external_order_id TEXT NOT NULL,
  source_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_order_usage_events_order_unique
  ON public.merchant_order_usage_events (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_order_usage_events_merchant_created_idx
  ON public.merchant_order_usage_events (merchant_id, created_at);

ALTER TABLE public.merchant_order_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.merchant_order_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.merchant_order_usage_events TO service_role;

-- Existing orders are the historical source of truth for usage at cutover.
INSERT INTO public.merchant_order_usage_events (
  merchant_id, order_id, external_order_id, created_at
)
SELECT merchant_id, id, external_order_id, created_at
FROM public.orders
ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.reconcile_merchant_order_usage(
  p_merchant_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_merchant public.merchants%ROWTYPE;
  v_tier TEXT;
  v_period_start TIMESTAMPTZ;
  v_used INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT *
  INTO v_merchant
  FROM public.merchants
  WHERE id = p_merchant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_tier := COALESCE(NULLIF(BTRIM(v_merchant.subscription_tier), ''), 'starter');
  IF v_tier = 'starter' OR v_merchant.subscription_expires_at IS NULL THEN
    v_period_start := v_now - INTERVAL '30 days';
  ELSE
    v_period_start := v_merchant.subscription_expires_at - INTERVAL '30 days';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_used
  FROM public.merchant_order_usage_events
  WHERE merchant_id = p_merchant_id
    AND created_at >= v_period_start;

  UPDATE public.merchants
  SET monthly_orders_used = v_used
  WHERE id = p_merchant_id
    AND monthly_orders_used IS DISTINCT FROM v_used;

  RETURN v_used;
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_tracked_order_with_quota(
  p_merchant_id UUID,
  p_external_order_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_product_name TEXT,
  p_product_image TEXT,
  p_current_status TEXT,
  p_carrier_last_event_at TIMESTAMPTZ,
  p_carrier_name TEXT,
  p_carrier_tracking_number TEXT,
  p_carrier_order_id TEXT,
  p_carrier_metadata JSONB,
  p_source_provider TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_merchant public.merchants%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_has_existing BOOLEAN := FALSE;
  v_tier TEXT;
  v_default_limit INTEGER;
  v_order_limit INTEGER;
  v_period_start TIMESTAMPTZ;
  v_used INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- This row lock serializes all first-time order reservations for one merchant.
  SELECT *
  INTO v_merchant
  FROM public.merchants
  WHERE id = p_merchant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'merchant_not_found');
  END IF;

  IF v_merchant.subscription_status = 'suspended' THEN
    RETURN jsonb_build_object('outcome', 'account_suspended');
  END IF;

  -- Re-check for an order created while this request was waiting for the lock.
  -- These match the same identity rules used by TrackingOrchestrator.findExistingOrder.
  IF NULLIF(BTRIM(p_carrier_order_id), '') IS NOT NULL
     AND NULLIF(BTRIM(p_carrier_name), '') IS NOT NULL THEN
    SELECT o.*
    INTO v_existing
    FROM public.orders AS o
    WHERE o.merchant_id = p_merchant_id
      AND o.carrier_name = p_carrier_name
      AND o.carrier_order_id = p_carrier_order_id
    ORDER BY o.created_at DESC
    LIMIT 1;
    v_has_existing := FOUND;
  END IF;

  IF NOT v_has_existing
     AND NULLIF(BTRIM(p_external_order_id), '') IS NOT NULL
     AND p_external_order_id <> 'UNKNOWN_ORDER'
     AND NOT (
       COALESCE(p_source_provider, '') IN ('yalidine', 'guepex')
       AND p_external_order_id = p_carrier_tracking_number
     ) THEN
    SELECT o.*
    INTO v_existing
    FROM public.orders AS o
    WHERE o.merchant_id = p_merchant_id
      AND o.external_order_id = p_external_order_id
      AND (
        NULLIF(BTRIM(p_carrier_name), '') IS NULL
        OR o.carrier_name IS NULL
        OR o.carrier_name = p_carrier_name
      )
    ORDER BY o.created_at DESC
    LIMIT 1;
    v_has_existing := FOUND;
  END IF;

  IF NOT v_has_existing
     AND NULLIF(BTRIM(p_carrier_tracking_number), '') IS NOT NULL THEN
    SELECT o.*
    INTO v_existing
    FROM public.orders AS o
    WHERE o.merchant_id = p_merchant_id
      AND o.carrier_tracking_number = p_carrier_tracking_number
      AND (
        NULLIF(BTRIM(p_carrier_name), '') IS NULL
        OR o.carrier_name = p_carrier_name
      )
    ORDER BY o.created_at DESC
    LIMIT 1;
    v_has_existing := FOUND;
  END IF;

  IF v_has_existing THEN
    RETURN jsonb_build_object(
      'outcome', 'existing',
      'order_id', v_existing.id,
      'tracking_uuid', v_existing.tracking_uuid
    );
  END IF;

  -- Orders without any stable identity cannot be safely deduplicated.
  IF (
    NULLIF(BTRIM(p_external_order_id), '') IS NULL
    OR p_external_order_id IN ('UNKNOWN_ORDER', 'DIRECT_ORDER')
  )
  AND NULLIF(BTRIM(p_carrier_tracking_number), '') IS NULL
  AND NULLIF(BTRIM(p_carrier_order_id), '') IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_order_identity');
  END IF;

  v_tier := COALESCE(NULLIF(BTRIM(v_merchant.subscription_tier), ''), 'starter');

  IF (
    v_tier <> 'starter'
    AND v_merchant.subscription_expires_at IS NOT NULL
    AND v_merchant.subscription_expires_at < v_now
  ) OR v_merchant.subscription_status = 'expired' THEN
    IF v_tier <> 'starter'
       AND v_merchant.subscription_expires_at IS NOT NULL
       AND v_merchant.subscription_expires_at < v_now
       AND v_merchant.subscription_status IS DISTINCT FROM 'expired' THEN
      UPDATE public.merchants
      SET subscription_status = 'expired'
      WHERE id = p_merchant_id;
    END IF;
    RETURN jsonb_build_object('outcome', 'subscription_expired');
  END IF;

  v_default_limit := CASE v_tier
    WHEN 'starter' THEN 30
    WHEN 'basic' THEN 100
    WHEN 'growth' THEN 200
    WHEN 'scale' THEN 999999
    ELSE 30
  END;

  IF v_tier = 'scale' THEN
    v_order_limit := 999999;
  ELSIF v_merchant.max_orders_limit IS NOT NULL
        AND v_merchant.max_orders_limit >= v_default_limit THEN
    v_order_limit := v_merchant.max_orders_limit;
  ELSE
    v_order_limit := v_default_limit;
  END IF;

  -- Free tier is a rolling 30-day window. Paid plans use their active
  -- 30-day subscription period, anchored by the recorded expiry timestamp.
  IF v_tier = 'starter' OR v_merchant.subscription_expires_at IS NULL THEN
    v_period_start := v_now - INTERVAL '30 days';
  ELSE
    v_period_start := v_merchant.subscription_expires_at - INTERVAL '30 days';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_used
  FROM public.merchant_order_usage_events
  WHERE merchant_id = p_merchant_id
    AND created_at >= v_period_start;

  -- Reconcile legacy/stale counters before enforcing the limit.
  UPDATE public.merchants
  SET monthly_orders_used = v_used
  WHERE id = p_merchant_id
    AND monthly_orders_used IS DISTINCT FROM v_used;

  IF v_tier <> 'scale' AND v_used >= v_order_limit THEN
    RETURN jsonb_build_object(
      'outcome', 'subscription_limit_reached',
      'monthly_orders_used', v_used,
      'order_limit', v_order_limit
    );
  END IF;

  INSERT INTO public.orders (
    merchant_id,
    external_order_id,
    customer_name,
    customer_phone,
    product_name,
    product_image,
    current_status,
    carrier_last_event_at,
    carrier_name,
    carrier_tracking_number,
    carrier_order_id,
    carrier_metadata
  )
  VALUES (
    p_merchant_id,
    p_external_order_id,
    p_customer_name,
    p_customer_phone,
    p_product_name,
    p_product_image,
    p_current_status,
    p_carrier_last_event_at,
    COALESCE(NULLIF(p_carrier_name, ''), 'Yalidine Express'),
    p_carrier_tracking_number,
    p_carrier_order_id,
    p_carrier_metadata
  )
  RETURNING * INTO v_order;

  INSERT INTO public.merchant_order_usage_events (
    merchant_id,
    order_id,
    external_order_id,
    source_provider,
    created_at
  )
  VALUES (
    p_merchant_id,
    v_order.id,
    p_external_order_id,
    p_source_provider,
    v_order.created_at
  );

  v_used := v_used + 1;
  UPDATE public.merchants
  SET monthly_orders_used = v_used
  WHERE id = p_merchant_id;

  RETURN jsonb_build_object(
    'outcome', 'created',
    'order_id', v_order.id,
    'tracking_uuid', v_order.tracking_uuid,
    'monthly_orders_used', v_used,
    'order_limit', v_order_limit
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.reconcile_merchant_order_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_merchant_order_usage(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.create_tracked_order_with_quota(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tracked_order_with_quota(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
