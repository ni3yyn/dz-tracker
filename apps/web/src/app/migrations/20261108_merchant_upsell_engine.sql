-- ============================================================================
-- TajerTrack Migration: Merchant Upsells / "You May Also Like" Engine
-- Date: 2026-11-08
-- Description:
--   1. Stores product recommendations configured by merchants.
--   2. Displayed directly on customer tracking pages (/t/[uuid]).
--   3. Fast, platform-agnostic (Shopify, YouCan, WooCommerce, Custom Stores).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_upsells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    product_url TEXT NOT NULL,
    price TEXT, -- Optional price (e.g. "3,500 دج" or "3500")
    currency TEXT DEFAULT 'دج',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning fast queries on tracking pages and dashboard
CREATE INDEX IF NOT EXISTS idx_merchant_upsells_lookup
ON public.merchant_upsells (merchant_id, is_active, display_order ASC, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.merchant_upsells ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policy: Anyone can read active upsells for tracking pages
CREATE POLICY "Public read active upsells"
ON public.merchant_upsells
FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

-- 2. Merchant Policy: Merchants can manage (SELECT, INSERT, UPDATE, DELETE) their own upsell items
CREATE POLICY "Merchants manage their own upsells"
ON public.merchant_upsells
FOR ALL
TO authenticated
USING (
    merchant_id IN (
        SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()
    )
)
WITH CHECK (
    merchant_id IN (
        SELECT id FROM public.merchants WHERE auth_user_id = auth.uid()
    )
);

-- Grant appropriate permissions
GRANT ALL ON public.merchant_upsells TO service_role;
GRANT SELECT ON public.merchant_upsells TO anon, authenticated;

