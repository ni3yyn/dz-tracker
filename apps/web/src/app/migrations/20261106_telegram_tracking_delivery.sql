-- ==============================================================================
-- TajerTrack — Automated Telegram Tracking Link Delivery Migration
-- File: apps/web/src/app/migrations/20261106_telegram_tracking_delivery.sql
-- Architecture: Transactional PostgreSQL Outbox + Isolated Worker Coordination
-- ==============================================================================

-- 1. Merchant Configuration Switch (Default: disabled until merchant enables)
ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS telegram_tracking_link_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Explicit Order Consent Metadata
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS telegram_consent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS telegram_consent_source TEXT,
ADD COLUMN IF NOT EXISTS telegram_consent_version TEXT;

-- 3. Main Telegram Tracking Outbox Table
CREATE TABLE IF NOT EXISTS public.telegram_tracking_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'processing',
            'retry',
            'sent',
            'skipped',
            'failed',
            'dead_letter'
        )
    ),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    telegram_random_id BIGINT UNIQUE,
    telegram_user_id BIGINT,
    telegram_message_id BIGINT,
    result_code TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT telegram_tracking_one_job_per_order UNIQUE (order_id)
);

-- 4. Attempt History Table
CREATE TABLE IF NOT EXISTS public.telegram_tracking_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.telegram_tracking_outbox(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    operation TEXT NOT NULL CHECK (
        operation IN (
            'phone_resolution',
            'message_send',
            'session_check'
        )
    ),
    outcome TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, attempt_number, operation)
);

-- 5. Worker State Singleton Table (ID=1)
CREATE TABLE IF NOT EXISTS public.telegram_worker_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    next_phone_resolution_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paused_until TIMESTAMPTZ,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure singleton row exists
INSERT INTO public.telegram_worker_state (id, is_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 6. Indexes for Queue Performance and Lease Reclamation
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_pending
ON public.telegram_tracking_outbox (available_at, created_at)
WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_telegram_outbox_processing_lease
ON public.telegram_tracking_outbox (lease_expires_at)
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_telegram_attempts_job
ON public.telegram_tracking_attempts (job_id, created_at DESC);

-- 7. Trigger Function: Atomic Outbox Job Generation on New Order Insert
CREATE OR REPLACE FUNCTION public.trg_fn_orders_create_telegram_outbox_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant_enabled BOOLEAN;
BEGIN
    -- 1. Verify customer phone is present and not blank
    IF NEW.customer_phone IS NULL OR TRIM(NEW.customer_phone) = '' THEN
        RETURN NEW;
    END IF;

    -- 2. Verify explicit Telegram notification consent was recorded
    IF NEW.telegram_consent_at IS NULL THEN
        RETURN NEW;
    END IF;

    -- 3. Verify merchant has the Telegram tracking link feature enabled
    SELECT telegram_tracking_link_enabled INTO v_merchant_enabled
    FROM public.merchants
    WHERE id = NEW.merchant_id;

    IF v_merchant_enabled IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- 4. Insert exactly one pending outbox job (Atomic with the order transaction)
    INSERT INTO public.telegram_tracking_outbox (
        order_id,
        merchant_id,
        idempotency_key,
        status,
        available_at,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.merchant_id,
        'telegram:tracking-link:' || NEW.id::text,
        'pending',
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN NEW;
END;
$$;

-- 8. Bind Trigger ONLY to AFTER INSERT on public.orders (No update triggers)
DROP TRIGGER IF EXISTS trg_orders_create_telegram_outbox_job ON public.orders;

CREATE TRIGGER trg_orders_create_telegram_outbox_job
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_orders_create_telegram_outbox_job();

-- 9. Atomic Worker Queue Claim Function (FOR UPDATE SKIP LOCKED)
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
    v_job_id UUID;
    v_worker_active BOOLEAN;
    v_paused_until TIMESTAMPTZ;
BEGIN
    -- Check if worker service is globally enabled and not paused
    SELECT is_enabled, paused_until INTO v_worker_active, v_paused_until
    FROM public.telegram_worker_state
    WHERE id = 1;

    IF v_worker_active IS NOT TRUE THEN
        RETURN;
    END IF;

    IF v_paused_until IS NOT NULL AND v_paused_until > NOW() THEN
        RETURN;
    END IF;

    -- Find earliest eligible pending, retry, or expired processing job
    SELECT id INTO v_job_id
    FROM public.telegram_tracking_outbox
    WHERE (status IN ('pending', 'retry') AND available_at <= NOW())
       OR (status = 'processing' AND lease_expires_at < NOW())
    ORDER BY available_at ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    -- Lock and transition to processing with lease expiration
    RETURN QUERY
    UPDATE public.telegram_tracking_outbox
    SET status = 'processing',
        locked_by = p_worker_id,
        locked_at = NOW(),
        lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        attempt_count = attempt_count + 1,
        updated_at = NOW()
    WHERE id = v_job_id
    RETURNING *;
END;
$$;

-- 10. Worker Lease Coordination Function
CREATE OR REPLACE FUNCTION public.acquire_telegram_worker_lease(
    p_worker_id TEXT,
    p_lease_seconds INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_acquired BOOLEAN := FALSE;
BEGIN
    UPDATE public.telegram_worker_state
    SET lease_owner = p_worker_id,
        lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE id = 1
      AND (
          lease_owner IS NULL
          OR lease_owner = p_worker_id
          OR lease_expires_at IS NULL
          OR lease_expires_at < NOW()
      );

    IF FOUND THEN
        v_acquired := TRUE;
    END IF;

    RETURN v_acquired;
END;
$$;

-- 11. Row Level Security (RLS) Configuration
ALTER TABLE public.telegram_tracking_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_tracking_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_worker_state ENABLE ROW LEVEL SECURITY;

-- Revoke ordinary access from anon and authenticated clients
REVOKE ALL ON public.telegram_tracking_outbox FROM anon, authenticated;
REVOKE ALL ON public.telegram_tracking_attempts FROM anon, authenticated;
REVOKE ALL ON public.telegram_worker_state FROM anon, authenticated;

-- Allow trusted server-side service role full management
GRANT ALL ON public.telegram_tracking_outbox TO service_role;
GRANT ALL ON public.telegram_tracking_attempts TO service_role;
GRANT ALL ON public.telegram_worker_state TO service_role;

