-- TajerTrack: retain versioned proof that a merchant accepted the legal documents at signup.
-- Run this migration in the production Supabase SQL editor before deploying the signup change.

CREATE TABLE IF NOT EXISTS public.merchant_legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acceptance_source TEXT NOT NULL DEFAULT 'merchant_signup',
  CONSTRAINT merchant_legal_acceptances_user_versions_unique
    UNIQUE (user_id, terms_version, privacy_version),
  CONSTRAINT merchant_legal_acceptances_terms_version_nonempty
    CHECK (length(trim(terms_version)) > 0),
  CONSTRAINT merchant_legal_acceptances_privacy_version_nonempty
    CHECK (length(trim(privacy_version)) > 0)
);

CREATE INDEX IF NOT EXISTS merchant_legal_acceptances_user_accepted_at_idx
  ON public.merchant_legal_acceptances (user_id, accepted_at DESC);

ALTER TABLE public.merchant_legal_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.merchant_legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.merchant_legal_acceptances TO service_role;

COMMENT ON TABLE public.merchant_legal_acceptances IS
  'Server-written audit records of merchant acceptance of the exact Terms and Privacy Policy versions.';
