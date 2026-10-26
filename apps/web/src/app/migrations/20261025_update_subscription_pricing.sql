-- TajerTrack subscription pricing update (2026-10-25)
-- Run once against the production Supabase database after deploying the updated dashboard.
-- This aligns existing merchants' stored limits with the new pricing tiers.

UPDATE public.merchants
SET max_orders_limit = CASE subscription_tier
  WHEN 'starter' THEN 30
  WHEN 'basic' THEN 100
  WHEN 'growth' THEN 200
  WHEN 'scale' THEN 999999
  ELSE max_orders_limit
END
WHERE subscription_tier IN ('starter', 'basic', 'growth', 'scale');
