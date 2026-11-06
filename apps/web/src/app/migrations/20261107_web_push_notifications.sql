-- ============================================================================
-- TajerTrack Migration: Web Push Notifications Foundation
-- Date: 2026-11-07
-- Description:
--   1. Categorizes order_history events (order_created vs status_changed).
--   2. Manages browser push subscriptions (many-to-many device-order model).
--   3. Transactional Outbox for push delivery with PostgreSQL triggers.
--   4. Atomic RPCs for status transitions and queue claiming.
--   5. Strict Row-Level Security (RLS) and administrative isolation.
-- ============================================================================

-- 1. Classify order_history Events
ALTER TABLE public.order_history
ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'status_changed';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'order_history_event_type_check'
    ) THEN
        ALTER TABLE public.order_history
        ADD CONSTRAINT order_history_event_type_check
        CHECK (event_type IN ('order_created', 'status_changed'));
    END IF;
END $$;

-- 2. Browser Device Subscriptions Registry
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL,
    endpoint_hash TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth_secret TEXT NOT NULL,
    expiration_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked')),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_error_code TEXT
);

-- 3. Shipment-to-Device Association (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.order_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    push_subscription_id UUID NOT NULL REFERENCES public.web_push_subscriptions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (order_id, push_subscription_id)
);

-- 4. Push Notification Outbox Table
CREATE TABLE IF NOT EXISTS public.web_push_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_history_id UUID NOT NULL REFERENCES public.order_history(id) ON DELETE CASCADE,
    order_push_subscription_id UUID NOT NULL REFERENCES public.order_push_subscriptions(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'failed', 'cancelled', 'dead_letter')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    result_code TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT one_push_per_event_device UNIQUE (order_history_id, order_push_subscription_id)
);

-- 5. Delivery Attempts Audit Log
CREATE TABLE IF NOT EXISTS public.web_push_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.web_push_outbox(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    operation TEXT NOT NULL DEFAULT 'push_send',
    outcome TEXT NOT NULL,
    response_status INTEGER,
    error_code TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, attempt_number)
);

-- 6. Web Push Worker State Singleton
CREATE TABLE IF NOT EXISTS public.web_push_worker_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    paused_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.web_push_worker_state (id, is_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 7. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_status
ON public.web_push_subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_order_push_subscriptions_order
ON public.order_push_subscriptions (order_id)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_push_subscriptions_device
ON public.order_push_subscriptions (push_subscription_id)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_web_push_outbox_pending
ON public.web_push_outbox (available_at, created_at)
WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_web_push_outbox_lease
ON public.web_push_outbox (lease_expires_at)
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_web_push_attempts_job
ON public.web_push_attempts (job_id, created_at DESC);

-- 8. Row Level Security (RLS) Policies
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_worker_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.web_push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.order_push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.web_push_outbox FROM anon, authenticated;
REVOKE ALL ON public.web_push_attempts FROM anon, authenticated;
REVOKE ALL ON public.web_push_worker_state FROM anon, authenticated;

GRANT ALL ON public.web_push_subscriptions TO service_role;
GRANT ALL ON public.order_push_subscriptions TO service_role;
GRANT ALL ON public.web_push_outbox TO service_role;
GRANT ALL ON public.web_push_attempts TO service_role;
GRANT ALL ON public.web_push_worker_state TO service_role;

-- 9. Trigger Function: Fan-out push notifications on status_changed history inserts
CREATE OR REPLACE FUNCTION public.trg_fn_order_history_create_web_push_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only genuine subsequent status transitions trigger notifications
    IF NEW.event_type IS DISTINCT FROM 'status_changed' THEN
        RETURN NEW;
    END IF;

    -- Fan out one outbox job per active shipment-device subscription
    INSERT INTO public.web_push_outbox (
        order_history_id,
        order_push_subscription_id,
        idempotency_key,
        status,
        available_at,
        created_at,
        updated_at
    )
    SELECT
        NEW.id,
        ops.id,
        'webpush:' || NEW.id::text || ':' || ops.id::text,
        'pending',
        NOW(),
        NOW(),
        NOW()
    FROM public.order_push_subscriptions ops
    JOIN public.web_push_subscriptions wps
        ON wps.id = ops.push_subscription_id
    WHERE ops.order_id = NEW.order_id
      AND ops.revoked_at IS NULL
      AND wps.status = 'active'
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_history_create_web_push_jobs ON public.order_history;

CREATE TRIGGER trg_order_history_create_web_push_jobs
AFTER INSERT ON public.order_history
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_order_history_create_web_push_jobs();

-- 10. Atomic Status Change RPC Function
CREATE OR REPLACE FUNCTION public.record_order_status_change(
    p_order_id UUID,
    p_status_raw TEXT,
    p_status_title TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
    changed BOOLEAN,
    history_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_status TEXT;
    v_history_id UUID := NULL;
BEGIN
    -- 1. Lock order row for atomic evaluation
    SELECT current_status INTO v_current_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID;
        RETURN;
    END IF;

    -- 2. Prevent duplicate notifications on unchanged status
    IF v_current_status = p_status_raw THEN
        RETURN QUERY SELECT FALSE, NULL::UUID;
        RETURN;
    END IF;

    -- 3. Update current status in orders table
    UPDATE public.orders
    SET current_status = p_status_raw,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 4. Insert history entry with event_type = status_changed (triggers push outbox fanout)
    INSERT INTO public.order_history (
        order_id,
        status_raw,
        status_title,
        description,
        event_type,
        created_at
    )
    VALUES (
        p_order_id,
        p_status_raw,
        p_status_title,
        p_description,
        'status_changed',
        NOW()
    )
    RETURNING id INTO v_history_id;

    RETURN QUERY SELECT TRUE, v_history_id;
END;
$$;

-- 11. Atomic Push Outbox Queue Claiming Function (SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_next_web_push_job(
    p_worker_id TEXT,
    p_lease_seconds INTEGER DEFAULT 30
)
RETURNS SETOF public.web_push_outbox
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
    FROM public.web_push_worker_state
    WHERE id = 1;

    IF v_worker_active IS NOT TRUE THEN
        RETURN;
    END IF;

    IF v_paused_until IS NOT NULL AND v_paused_until > NOW() THEN
        RETURN;
    END IF;

    -- Find earliest eligible pending, retry, or expired processing job
    SELECT id INTO v_job_id
    FROM public.web_push_outbox
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
    UPDATE public.web_push_outbox
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

