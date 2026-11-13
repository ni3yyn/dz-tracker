-- TajerTrack: custom plan quote requests from prospective merchants.
-- Public submissions are accepted only through the server action using service_role.
-- The admin dashboard reads and updates requests after its server-side admin check.

CREATE TABLE IF NOT EXISTS public.custom_plan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  store_name TEXT NOT NULL CHECK (char_length(store_name) BETWEEN 2 AND 120),
  contact_phone TEXT NOT NULL CHECK (char_length(contact_phone) BETWEEN 8 AND 24),
  preferred_contact_method TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (preferred_contact_method IN ('whatsapp', 'phone')),
  monthly_tracking_urls INTEGER NOT NULL
    CHECK (monthly_tracking_urls > 0 AND monthly_tracking_urls <= 2000000),
  carrier_names TEXT,
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'quoted', 'closed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_plan_requests_status_created_idx
  ON public.custom_plan_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS custom_plan_requests_phone_created_idx
  ON public.custom_plan_requests (contact_phone, created_at DESC);

ALTER TABLE public.custom_plan_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.custom_plan_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.custom_plan_requests TO service_role;
