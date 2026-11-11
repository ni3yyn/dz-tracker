-- Customer exchange requests linked to delivered orders.
-- Feature enablement is stored in status_mappings under __feature_exchange_requests_enabled__.
CREATE TABLE IF NOT EXISTS public.order_exchange_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('size_mismatch', 'color_mismatch', 'wrong_product', 'damaged', 'other')),
  customer_note TEXT CHECK (customer_note IS NULL OR char_length(customer_note) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  merchant_response TEXT CHECK (merchant_response IS NULL OR char_length(merchant_response) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS order_exchange_requests_one_active_per_order ON public.order_exchange_requests(order_id) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS idx_order_exchange_requests_merchant_status_created ON public.order_exchange_requests(merchant_id, status, created_at DESC);
ALTER TABLE public.order_exchange_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_exchange_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_exchange_requests TO service_role;
