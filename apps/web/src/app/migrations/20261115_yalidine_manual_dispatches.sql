-- Manual Yalidine / Guepex shipment dispatches from the merchant's TajerTrack order form.
-- A reservation is written before any carrier POST so retries never create
-- another parcel after an ambiguous timeout or lost response.

CREATE TABLE IF NOT EXISTS public.yalidine_manual_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  external_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'unknown', 'created', 'rejected')),
  payload_hash TEXT NOT NULL,
  tracking_number TEXT,
  label_url TEXT,
  import_id BIGINT,
  failure_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT yalidine_manual_dispatches_merchant_order_unique
    UNIQUE (merchant_id, external_order_id),
  CONSTRAINT yalidine_manual_dispatches_created_tracking_check
    CHECK (status <> 'created' OR NULLIF(TRIM(tracking_number), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_yalidine_manual_dispatches_status
  ON public.yalidine_manual_dispatches (merchant_id, status, updated_at DESC);

ALTER TABLE public.yalidine_manual_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.yalidine_manual_dispatches FROM anon, authenticated;
GRANT ALL ON public.yalidine_manual_dispatches TO service_role;

COMMENT ON TABLE public.yalidine_manual_dispatches IS
  'Idempotency reservations for manual Yalidine / Guepex API parcel creation. Contains no customer PII.';

COMMENT ON COLUMN public.yalidine_manual_dispatches.external_order_id IS
  'The exact TajerTrack merchant order reference sent as Guepex/Yalidine order_id.';

COMMENT ON COLUMN public.yalidine_manual_dispatches.status IS
  'reserved=one request owns the first POST; unknown=carrier outcome must be resolved by GET/reference or manual attach; created=tracking is confirmed; rejected=carrier definitively refused the parcel.';
