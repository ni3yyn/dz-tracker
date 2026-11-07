-- Migration: Order Confirmation via Telegram
-- Run in Supabase SQL Editor

-- 1. Add confirmation columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT CHECK (confirmation_status IN ('pending', 'confirmed', 'cancelled')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_token TEXT UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_responded_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add confirmation toggle to merchants table
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS confirmation_telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create the confirmation outbox table
CREATE TABLE IF NOT EXISTS order_confirmation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'retry', 'skipped', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT DEFAULT NULL,
  locked_at TIMESTAMPTZ DEFAULT NULL,
  lease_expires_at TIMESTAMPTZ DEFAULT NULL,
  telegram_random_id BIGINT DEFAULT NULL,
  telegram_user_id BIGINT DEFAULT NULL,
  telegram_message_id INTEGER DEFAULT NULL,
  result_code TEXT DEFAULT NULL,
  last_error_code TEXT DEFAULT NULL,
  last_error_message TEXT DEFAULT NULL,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Index for efficient queue polling (same pattern as tracking outbox)
CREATE INDEX IF NOT EXISTS idx_confirmation_outbox_queue
  ON order_confirmation_outbox (available_at ASC)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_confirmation_outbox_order
  ON order_confirmation_outbox (order_id);

-- 5. RPC: Claim next confirmation job atomically (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION claim_next_confirmation_job(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF order_confirmation_outbox
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE order_confirmation_outbox
  SET
    status = 'processing',
    locked_by = p_worker_id,
    locked_at = NOW(),
    lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
    attempt_count = attempt_count + 1,
    updated_at = NOW()
  WHERE id = (
    SELECT id
    FROM order_confirmation_outbox
    WHERE status IN ('pending', 'retry')
      AND available_at <= NOW()
    ORDER BY available_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- 6. Enable RLS on new table (same policy as outbox — service role only)
ALTER TABLE order_confirmation_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to confirmation outbox"
  ON order_confirmation_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Public read policy for confirmation token lookup (anon can read to verify token)
-- We use the web API route with service_role key, so no extra policy needed.

