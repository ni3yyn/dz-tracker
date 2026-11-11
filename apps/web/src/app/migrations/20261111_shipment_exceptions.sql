-- Merchant workflow state for shipment exceptions detected from verified courier data.
CREATE TABLE IF NOT EXISTS public.merchant_shipment_exception_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  exception_type TEXT NOT NULL CHECK (exception_type IN (
    'delivery_failed','delivery_postponed','no_first_scan','out_for_delivery_stalled',
    'shipment_stalled','pickup_waiting','returning','returned'
  )),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','snoozed','resolved')),
  event_fingerprint TEXT NOT NULL,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_shipment_exception_state_unique UNIQUE (merchant_id, order_id, exception_type)
);
CREATE INDEX IF NOT EXISTS idx_merchant_shipment_exception_states_merchant
  ON public.merchant_shipment_exception_states (merchant_id, state, updated_at DESC);
ALTER TABLE public.merchant_shipment_exception_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_shipment_exception_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.merchant_shipment_exception_states TO service_role;
