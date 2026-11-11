-- CI-only migration and state-lifecycle test. The quota fixture runs first and
-- creates the minimal merchants/orders schema used by this migration.
\set ON_ERROR_STOP on
\ir ../../src/app/migrations/20261111_shipment_exceptions.sql

DO $shipment_exception_test$
DECLARE
  v_merchant UUID := '10000000-0000-4000-8000-000000000005';
  v_order UUID;
  v_rows INTEGER;
  v_rls BOOLEAN;
BEGIN
  INSERT INTO public.merchants (id, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used)
  VALUES (v_merchant, 'starter', 'active', 30, 0);

  INSERT INTO public.orders (merchant_id, external_order_id, current_status, carrier_last_event_at)
  VALUES (v_merchant, 'exception-fixture-order', 'in_transit', NOW() - INTERVAL '4 days')
  RETURNING id INTO v_order;

  INSERT INTO public.merchant_shipment_exception_states (
    merchant_id, order_id, exception_type, state, event_fingerprint
  )
  VALUES (v_merchant, v_order, 'shipment_stalled', 'open', 'in_transit|event-1|tracking-1');

  INSERT INTO public.merchant_shipment_exception_states (
    merchant_id, order_id, exception_type, state, event_fingerprint
  )
  VALUES (v_merchant, v_order, 'shipment_stalled', 'acknowledged', 'in_transit|event-1|tracking-1')
  ON CONFLICT (merchant_id, order_id, exception_type)
  DO UPDATE SET state = EXCLUDED.state, event_fingerprint = EXCLUDED.event_fingerprint;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Exception state upsert did not affect exactly one row: %', v_rows;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.merchant_shipment_exception_states
    WHERE merchant_id = v_merchant
      AND order_id = v_order
      AND exception_type = 'shipment_stalled'
      AND state = 'acknowledged'
      AND event_fingerprint = 'in_transit|event-1|tracking-1'
  ) THEN
    RAISE EXCEPTION 'Merchant review state was not persisted.';
  END IF;

  BEGIN
    INSERT INTO public.merchant_shipment_exception_states (
      merchant_id, order_id, exception_type, state, event_fingerprint
    )
    VALUES (v_merchant, v_order, 'not_a_real_exception', 'open', 'bad');
    RAISE EXCEPTION 'Invalid exception type was accepted.';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid = 'public.merchant_shipment_exception_states'::regclass;
  IF v_rls IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'RLS must be enabled on merchant exception state.';
  END IF;

  DELETE FROM public.orders WHERE id = v_order;
  IF EXISTS (
    SELECT 1 FROM public.merchant_shipment_exception_states WHERE order_id = v_order
  ) THEN
    RAISE EXCEPTION 'Deleting an order must cascade its merchant exception state.';
  END IF;
END;
$shipment_exception_test$;
