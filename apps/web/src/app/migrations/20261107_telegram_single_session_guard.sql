-- =============================================================================
-- TajerTrack Telegram worker: single MTProto session owner + queue fencing
--
-- IMPORTANT:
--   telegram_worker_state.lease_owner now stores a UNIQUE PROCESS INSTANCE ID,
--   not the shared TELEGRAM_WORKER_ID service label.
--   The app acquires/renews this lease before opening Telegram and releases it
--   only after closing its MTProto transport.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_confirmation_outbox_processing_lease
  ON public.order_confirmation_outbox (lease_expires_at)
  WHERE status = 'processing';

-- Keep the acquisition operation atomic. A different process can acquire only
-- after the previous owner releases or its lease expires.
CREATE OR REPLACE FUNCTION public.acquire_telegram_worker_lease(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_worker_id IS NULL OR BTRIM(p_worker_id) = '' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telegram_worker_state
  SET lease_owner = p_worker_id,
      lease_expires_at = clock_timestamp()
        + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 60), 15)),
      updated_at = clock_timestamp()
  WHERE id = 1
    AND (
      lease_owner IS NULL
      OR lease_expires_at IS NULL
      OR lease_expires_at <= clock_timestamp()
      OR lease_owner = p_worker_id
    );

  RETURN FOUND;
END;
$$;

-- Tracking jobs may only be claimed by the process that currently owns the
-- singleton session lease. The state row is share-locked during the claim so a
-- lease transfer cannot race this short transaction.
CREATE OR REPLACE FUNCTION public.claim_next_telegram_tracking_job(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS SETOF public.telegram_tracking_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_active BOOLEAN;
  v_paused_until TIMESTAMPTZ;
  v_lease_owner TEXT;
  v_lease_expires_at TIMESTAMPTZ;
  v_job_id UUID;
BEGIN
  SELECT is_enabled, paused_until, lease_owner, lease_expires_at
    INTO v_worker_active, v_paused_until, v_lease_owner, v_lease_expires_at
  FROM public.telegram_worker_state
  WHERE id = 1
  FOR SHARE;

  IF v_worker_active IS NOT TRUE
     OR v_lease_owner IS DISTINCT FROM p_worker_id
     OR v_lease_expires_at IS NULL
     OR v_lease_expires_at <= clock_timestamp() THEN
    RETURN;
  END IF;

  IF v_paused_until IS NOT NULL AND v_paused_until > clock_timestamp() THEN
    RETURN;
  END IF;

  SELECT id INTO v_job_id
  FROM public.telegram_tracking_outbox
  WHERE (
      status IN ('pending', 'retry')
      AND available_at <= clock_timestamp()
    )
    OR (
      status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    )
  ORDER BY available_at ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.telegram_tracking_outbox
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = clock_timestamp(),
      lease_expires_at = clock_timestamp()
        + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 60), 15)),
      attempt_count = attempt_count + 1,
      updated_at = clock_timestamp()
  WHERE id = v_job_id
  RETURNING *;
END;
$$;

-- Confirmation jobs share the SAME global Telegram session lock and pause
-- window. Expired processing jobs are reclaimed instead of being stranded.
CREATE OR REPLACE FUNCTION public.claim_next_confirmation_job(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS SETOF public.order_confirmation_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_active BOOLEAN;
  v_paused_until TIMESTAMPTZ;
  v_lease_owner TEXT;
  v_lease_expires_at TIMESTAMPTZ;
  v_job_id UUID;
BEGIN
  SELECT is_enabled, paused_until, lease_owner, lease_expires_at
    INTO v_worker_active, v_paused_until, v_lease_owner, v_lease_expires_at
  FROM public.telegram_worker_state
  WHERE id = 1
  FOR SHARE;

  IF v_worker_active IS NOT TRUE
     OR v_lease_owner IS DISTINCT FROM p_worker_id
     OR v_lease_expires_at IS NULL
     OR v_lease_expires_at <= clock_timestamp() THEN
    RETURN;
  END IF;

  IF v_paused_until IS NOT NULL AND v_paused_until > clock_timestamp() THEN
    RETURN;
  END IF;

  SELECT id INTO v_job_id
  FROM public.order_confirmation_outbox
  WHERE (
      status IN ('pending', 'retry')
      AND available_at <= clock_timestamp()
    )
    OR (
      status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    )
  ORDER BY available_at ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.order_confirmation_outbox
  SET status = 'processing',
      locked_by = p_worker_id,
      locked_at = clock_timestamp(),
      lease_expires_at = clock_timestamp()
        + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 60), 15)),
      attempt_count = attempt_count + 1,
      updated_at = clock_timestamp()
  WHERE id = v_job_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_telegram_worker_lease(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_telegram_tracking_job(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_confirmation_job(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.acquire_telegram_worker_lease(TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_telegram_tracking_job(TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_confirmation_job(TEXT, INTEGER)
  TO service_role;
