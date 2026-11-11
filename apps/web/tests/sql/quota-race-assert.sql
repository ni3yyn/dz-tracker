DO $$
DECLARE
  v_orders INTEGER;
  v_used INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_orders
  FROM public.orders
  WHERE merchant_id = '10000000-0000-4000-8000-000000000004'
    AND created_at >= NOW() - INTERVAL '30 days';

  SELECT monthly_orders_used INTO v_used
  FROM public.merchants
  WHERE id = '10000000-0000-4000-8000-000000000004';

  IF v_orders <> 30 OR v_used <> 30 THEN
    RAISE EXCEPTION 'Concurrent quota reservation must create exactly one final order; orders %, usage %', v_orders, v_used;
  END IF;
END;
$$;
