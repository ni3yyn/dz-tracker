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

\ir ../../src/app/migrations/20261111_atomic_order_quota.sql

DO $$
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
END;
$$;
