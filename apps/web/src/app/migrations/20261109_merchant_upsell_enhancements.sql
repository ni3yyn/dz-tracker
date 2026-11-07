-- ============================================================================
-- TajerTrack Migration: Merchant Upsell Enhancements (Click Analytics & Ordering)
-- Date: 2026-11-09
-- Description:
--   1. Adds `clicks_count` column to track customer click conversions.
--   2. Creates atomic stored procedure `increment_merchant_upsell_clicks`.
--   3. Adds index for efficient sorting by display_order and clicks_count.
-- ============================================================================

-- 1. Add clicks_count column if it doesn't already exist
ALTER TABLE public.merchant_upsells
ADD COLUMN IF NOT EXISTS clicks_count INTEGER NOT NULL DEFAULT 0;

-- 2. Create index for fast sorting and metrics lookup
CREATE INDEX IF NOT EXISTS idx_merchant_upsells_order_clicks
ON public.merchant_upsells (merchant_id, display_order ASC, clicks_count DESC);

-- 3. Atomic increment function for upsell clicks (avoids race conditions)
CREATE OR REPLACE FUNCTION public.increment_merchant_upsell_clicks(upsell_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.merchant_upsells
  SET clicks_count = clicks_count + 1
  WHERE id = upsell_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.increment_merchant_upsell_clicks(UUID) TO anon, authenticated, service_role;

