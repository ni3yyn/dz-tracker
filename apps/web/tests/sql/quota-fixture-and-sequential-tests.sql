-- Ephemeral PostgreSQL fixture for the production quota functions.
-- Run only against the CI disposable database, never against production.
\set ON_ERROR_STOP on

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.merchants (
  id UUID PRIMARY KEY,
  store_name TEXT NOT NULL DEFAULT 'Quota test merchant',
  subscription_tier TEXT,
  subscription_status TEXT,
  max_orders_limit INTEGER,
  monthly_orders_used INTEGER NOT NULL DEFAULT 0,
  subscription_expires_at TIMESTAMPTZ
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id),
  external_order_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  product_name TEXT,
  product_image TEXT,
  tracking_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  current_status TEXT NOT NULL DEFAULT 'order_placed',
  carrier_name TEXT,
  carrier_tracking_number TEXT,
  carrier_order_id TEXT,
  carrier_metadata JSONB,
  carrier_last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, external_order_id)
);

CREATE TABLE public.order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status_raw TEXT NOT NULL,
  status_title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'status_changed'
    CHECK (event_type IN ('order_created', 'status_changed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.telegram_worker_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  next_phone_resolution_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.telegram_worker_state (id) VALUES (1);

\ir ../../src/app/migrations/20261111_telegram_phone_slot_reservation.sql
\ir ../../src/app/migrations/20261111_atomic_order_quota.sql
\ir ../../src/app/migrations/20261111_order_exchange_requests.sql
\ir ../../src/app/migrations/20261111_order_exchange_replacement_shipments.sql

DO $slot_test$
DECLARE
  v_first_slot TIMESTAMPTZ;
  v_second_slot TIMESTAMPTZ;
  v_pause_until TIMESTAMPTZ;
  v_confirmed_slot TIMESTAMPTZ;
BEGIN
  UPDATE public.telegram_worker_state
  SET next_phone_resolution_at = clock_timestamp(), paused_until = NULL
  WHERE id = 1;

  v_first_slot := public.reserve_telegram_phone_resolution_slot(3500);
  v_second_slot := public.reserve_telegram_phone_resolution_slot(3500);
  IF v_second_slot - v_first_slot < INTERVAL '3490 milliseconds' THEN
    RAISE EXCEPTION 'Concurrent Telegram loops were allocated overlapping slots: %, %', v_first_slot, v_second_slot;
  END IF;

  -- A FloodWait recorded after a slot was booked must invalidate that slot.
  v_pause_until := clock_timestamp() + INTERVAL '20 seconds';
  PERFORM public.pause_telegram_worker_until(v_pause_until);
  v_confirmed_slot := public.confirm_telegram_phone_resolution_slot(v_second_slot, 3500);
  IF v_confirmed_slot < v_pause_until THEN
    RAISE EXCEPTION 'Previously reserved Telegram slot bypassed a newer FloodWait: %, pause %', v_confirmed_slot, v_pause_until;
  END IF;

  IF public.confirm_telegram_phone_resolution_slot(v_confirmed_slot, 3500) <> v_confirmed_slot THEN
    RAISE EXCEPTION 'A valid Telegram slot should remain stable after confirmation.';
  END IF;
END;
$slot_test$;

DO $quota_test$
DECLARE
  v_result JSONB;
  v_used INTEGER;
  v_merchant UUID;
BEGIN
  -- Starter quota: 29 used, 30th succeeds, duplicate does not count twice,
  -- and the 31st distinct order is denied.
  v_merchant := '10000000-0000-4000-8000-000000000001';
  INSERT INTO public.merchants (id, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used)
  VALUES (v_merchant, 'starter', 'active', 30, 29);

  INSERT INTO public.orders (merchant_id, external_order_id, created_at)
  SELECT v_merchant, 'starter-existing-' || n, NOW() - INTERVAL '1 day'
  FROM generate_series(1, 29) AS n;
  INSERT INTO public.merchant_order_usage_events (merchant_id, order_id, external_order_id, created_at)
  SELECT merchant_id, id, external_order_id, created_at
  FROM public.orders WHERE merchant_id = v_merchant;

  v_result := public.create_tracked_order_with_quota(
    v_merchant, 'starter-30', NULL, NULL, NULL, NULL, 'order_placed',
    NULL, NULL, NULL, NULL, NULL, 'direct'
  );
  IF v_result->>'outcome' <> 'created' OR (v_result->>'monthly_orders_used')::INTEGER <> 30 THEN
    RAISE EXCEPTION 'Starter 30th order should be created at usage 30; got %', v_result;
  END IF;

  v_result := public.create_tracked_order_with_quota(
    v_merchant, 'starter-30', NULL, NULL, NULL, NULL, 'order_placed',
    NULL, NULL, NULL, NULL, NULL, 'direct'
  );
  IF v_result->>'outcome' <> 'existing' THEN
    RAISE EXCEPTION 'Duplicate order should resolve to existing without consuming quota; got %', v_result;
  END IF;

  -- Deleting the order record must not delete its quota event or refund usage.
  DELETE FROM public.orders
  WHERE merchant_id = v_merchant
    AND external_order_id = 'starter-existing-1';

  v_result := public.create_tracked_order_with_quota(
    v_merchant, 'starter-31', NULL, NULL, NULL, NULL, 'order_placed',
    NULL, NULL, NULL, NULL, NULL, 'direct'
  );
  IF v_result->>'outcome' <> 'subscription_limit_reached' THEN
    RAISE EXCEPTION 'Starter 31st order should be blocked; got %', v_result;
  END IF;

  SELECT monthly_orders_used INTO v_used FROM public.merchants WHERE id = v_merchant;
  IF v_used <> 30 THEN
    RAISE EXCEPTION 'Starter counter should remain 30, got %', v_used;
  END IF;

  -- Rolling free-plan window: stale legacy counter and orders older than 30
  -- days must not permanently consume the new cycle's allowance.
  v_merchant := '10000000-0000-4000-8000-000000000002';
  INSERT INTO public.merchants (id, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used)
  VALUES (v_merchant, 'starter', 'active', 30, 999);
  INSERT INTO public.orders (merchant_id, external_order_id, created_at)
  SELECT v_merchant, 'starter-old-' || n, NOW() - INTERVAL '31 days'
  FROM generate_series(1, 40) AS n;
  INSERT INTO public.merchant_order_usage_events (merchant_id, order_id, external_order_id, created_at)
  SELECT merchant_id, id, external_order_id, created_at
  FROM public.orders WHERE merchant_id = v_merchant;

  v_result := public.create_tracked_order_with_quota(
    v_merchant, 'starter-new-period', NULL, NULL, NULL, NULL, 'order_placed',
    NULL, NULL, NULL, NULL, NULL, 'direct'
  );
  IF v_result->>'outcome' <> 'created' OR (v_result->>'monthly_orders_used')::INTEGER <> 1 THEN
    RAISE EXCEPTION 'Old free-plan orders must age out of rolling quota; got %', v_result;
  END IF;

  -- Paid plan: the billing window begins 30 days before its expiry.
  v_merchant := '10000000-0000-4000-8000-000000000003';
  INSERT INTO public.merchants (id, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at)
  VALUES (v_merchant, 'basic', 'active', 100, 0, NOW() + INTERVAL '15 days');
  INSERT INTO public.orders (merchant_id, external_order_id, created_at)
  SELECT v_merchant, 'basic-existing-' || n, NOW() - INTERVAL '1 day'
  FROM generate_series(1, 99) AS n;
  INSERT INTO public.merchant_order_usage_events (merchant_id, order_id, external_order_id, created_at)
  SELECT merchant_id, id, external_order_id, created_at
  FROM public.orders WHERE merchant_id = v_merchant;

  v_result := public.create_tracked_order_with_quota(
    v_merchant, 'basic-100', NULL, NULL, NULL, NULL, 'order_placed',
    NULL, NULL, NULL, NULL, NULL, 'direct'
  );
  IF v_result->>'outcome' <> 'created' OR (v_result->>'monthly_orders_used')::INTEGER <> 100 THEN
    RAISE EXCEPTION 'Basic 100th order should be created; got %', v_result;
  END IF;

  v_result := public.create_tracked_order_with_quota(
    v_merchant, 'basic-101', NULL, NULL, NULL, NULL, 'order_placed',
    NULL, NULL, NULL, NULL, NULL, 'direct'
  );
  IF v_result->>'outcome' <> 'subscription_limit_reached' THEN
    RAISE EXCEPTION 'Basic 101st order should be blocked; got %', v_result;
  END IF;

  -- Seed the concurrency test at exactly one slot below the starter limit.
  v_merchant := '10000000-0000-4000-8000-000000000004';
  INSERT INTO public.merchants (id, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used)
  VALUES (v_merchant, 'starter', 'active', 30, 29);
  INSERT INTO public.orders (merchant_id, external_order_id, created_at)
  SELECT v_merchant, 'race-existing-' || n, NOW() - INTERVAL '1 day'
  FROM generate_series(1, 29) AS n;
  INSERT INTO public.merchant_order_usage_events (merchant_id, order_id, external_order_id, created_at)
  SELECT merchant_id, id, external_order_id, created_at
  FROM public.orders WHERE merchant_id = v_merchant;
END;
$quota_test$;


DO $exchange_lifecycle_test$
DECLARE
  v_merchant UUID := '20000000-0000-4000-8000-000000000001';
  v_order UUID;
  v_request UUID;
  v_result RECORD;
  v_shipment UUID;
  v_count INTEGER;
  v_original_status TEXT;
  v_candidate_order_a UUID;
  v_candidate_order_b UUID;
  v_request_a UUID;
  v_request_b UUID;
  v_candidate_result RECORD;
BEGIN
  INSERT INTO public.merchants(id, store_name, subscription_tier, subscription_status, max_orders_limit)
  VALUES (v_merchant, 'Exchange fixture merchant', 'starter', 'active', 30);

  -- A single exact match is linked without creating another order.
  INSERT INTO public.orders(merchant_id, external_order_id, customer_name, customer_phone, product_name, current_status, carrier_name, carrier_tracking_number, carrier_order_id)
  VALUES (v_merchant, 'EX-ORIGINAL-1', 'Ahmed Benali', '0555123456', 'Chemise Bleue', 'delivered', 'Yalidine', 'TRACK-ORIGINAL-1', 'CARRIER-ORIGINAL-1')
  RETURNING id INTO v_order;

  INSERT INTO public.order_exchange_requests(merchant_id, order_id, reason)
  VALUES (v_merchant, v_order, 'other') RETURNING id INTO v_request;

  PERFORM * FROM public.review_order_exchange_request(v_request, v_merchant, 'awaiting_shipment', 'Nous préparons le remplacement.');

  -- Courier replays of the original parcel must not be consumed as replacement shipments.
  SELECT * INTO v_result
  FROM public.process_exchange_replacement_event(
    v_merchant, 'yalidine', 'Yalidine', 'EX-ORIGINAL-1', 'TRACK-ORIGINAL-1', 'CARRIER-ORIGINAL-1',
    'Ahmed Benali', '0555123456', 'Chemise Bleue', 'delivered',
    'تم التسليم', 'تأكيد تسليم الطرد الأصلي', NULL, 'original-replay-1',
    '2026-11-11 09:30:00+00', FALSE
  );
  IF v_result.handled IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'The original delivered parcel must never be recognized as its own replacement.';
  END IF;

  SELECT * INTO v_result
  FROM public.process_exchange_replacement_event(
    v_merchant, 'yalidine', 'Yalidine', 'CARRIER-EXT-1', 'TRACK-EX-1', NULL,
    ' AHMED-BENALI ', '00213 555 123 456', 'chemise-bleue', 'in_transit',
    'وصلت الشحنة إلى مركز الفرز', 'تحديث أولي', NULL, 'exchange-event-1',
    '2026-11-11 10:00:00+00', FALSE
  );

  IF v_result.handled IS DISTINCT FROM TRUE OR v_result.needs_confirmation IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'A unique exact exchange match should link automatically: %', row_to_json(v_result);
  END IF;
  IF (SELECT status FROM public.order_exchange_requests WHERE id = v_request) <> 'replacement_in_transit' THEN
    RAISE EXCEPTION 'The exchange should enter replacement_in_transit after auto-linking.';
  END IF;
  IF (SELECT COUNT(*) FROM public.order_exchange_shipments WHERE exchange_request_id = v_request AND match_status = 'linked') <> 1 THEN
    RAISE EXCEPTION 'The replacement shipment was not linked exactly once.';
  END IF;
  SELECT current_status INTO v_original_status FROM public.orders WHERE id = v_order;
  IF v_original_status <> 'delivered' THEN
    RAISE EXCEPTION 'The original courier status must remain delivered, got %', v_original_status;
  END IF;

  -- A later carrier event must update the exchange record, not create an order.
  SELECT COUNT(*) INTO v_count FROM public.orders WHERE merchant_id = v_merchant;
  SELECT * INTO v_result
  FROM public.process_exchange_replacement_event(
    v_merchant, 'yalidine', 'Yalidine', 'CARRIER-EXT-1', 'TRACK-EX-1', 'YAL-ORDER-1',
    'Ahmed Benali', '0555123456', 'Chemise Bleue', 'delivered',
    'تم تسليم الشحنة', 'اكتمل التسليم', NULL, 'exchange-event-2',
    '2026-11-11 11:00:00+00', FALSE
  );
  IF v_result.handled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Subsequent replacement shipment updates must be intercepted.';
  END IF;
  IF (SELECT status FROM public.order_exchange_requests WHERE id = v_request) <> 'completed' THEN
    RAISE EXCEPTION 'The exchange should complete when the replacement is delivered.';
  END IF;
  IF (SELECT current_status FROM public.orders WHERE id = v_order) <> 'delivered' THEN
    RAISE EXCEPTION 'The original courier status was overwritten by a replacement event.';
  END IF;
  IF (SELECT COUNT(*) FROM public.orders WHERE merchant_id = v_merchant) <> v_count THEN
    RAISE EXCEPTION 'A replacement shipment update created an extra order.';
  END IF;

  -- Two exact matches are held for confirmation and cannot be silently attached.
  INSERT INTO public.orders(merchant_id, external_order_id, customer_name, customer_phone, product_name, current_status)
  VALUES (v_merchant, 'EX-ORIGINAL-2A', 'Sara Amine', '0666123456', 'Robe Noire', 'delivered')
  RETURNING id INTO v_candidate_order_a;
  INSERT INTO public.orders(merchant_id, external_order_id, customer_name, customer_phone, product_name, current_status)
  VALUES (v_merchant, 'EX-ORIGINAL-2B', 'Sara Amine', '0666123456', 'Robe Noire', 'delivered')
  RETURNING id INTO v_candidate_order_b;

  INSERT INTO public.order_exchange_requests(merchant_id, order_id, reason)
  VALUES (v_merchant, v_candidate_order_a, 'other') RETURNING id INTO v_request_a;
  INSERT INTO public.order_exchange_requests(merchant_id, order_id, reason)
  VALUES (v_merchant, v_candidate_order_b, 'other') RETURNING id INTO v_request_b;

  PERFORM * FROM public.review_order_exchange_request(v_request_a, v_merchant, 'awaiting_shipment', NULL);
  PERFORM * FROM public.review_order_exchange_request(v_request_b, v_merchant, 'awaiting_shipment', NULL);

  SELECT * INTO v_candidate_result
  FROM public.process_exchange_replacement_event(
    v_merchant, 'yalidine', 'Yalidine', 'CARRIER-EXT-2', 'TRACK-AMBIG-1', NULL,
    'Sara Amine', '0666 123 456', 'Robe Noire', 'in_transit',
    'قيد النقل', NULL, NULL, 'exchange-ambiguous-1',
    '2026-11-11 12:00:00+00', FALSE
  );
  IF v_candidate_result.handled IS DISTINCT FROM TRUE OR v_candidate_result.needs_confirmation IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Ambiguous exact matches must be held for merchant confirmation: %', row_to_json(v_candidate_result);
  END IF;
  SELECT id INTO v_shipment
  FROM public.order_exchange_shipments
  WHERE merchant_id = v_merchant AND carrier_tracking_number = 'TRACK-AMBIG-1';
  IF v_shipment IS NULL THEN
    RAISE EXCEPTION 'The ambiguous replacement shipment candidate was not persisted.';
  END IF;

  PERFORM * FROM public.confirm_order_exchange_shipment_match(v_shipment, v_request_a, v_merchant);
  IF (SELECT status FROM public.order_exchange_requests WHERE id = v_request_a) <> 'replacement_in_transit' THEN
    RAISE EXCEPTION 'Merchant confirmation did not transition the selected exchange.';
  END IF;
  IF (SELECT status FROM public.order_exchange_requests WHERE id = v_request_b) <> 'awaiting_shipment' THEN
    RAISE EXCEPTION 'Merchant confirmation changed an unselected exchange request.';
  END IF;
  IF (SELECT original_order_id FROM public.order_exchange_shipments WHERE id = v_shipment) <> v_candidate_order_a THEN
    RAISE EXCEPTION 'Ambiguous shipment was linked to the wrong original order.';
  END IF;
END;
$exchange_lifecycle_test$;
