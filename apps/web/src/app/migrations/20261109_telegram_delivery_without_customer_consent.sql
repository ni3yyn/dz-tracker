-- ==============================================================================
-- TajerTrack — Telegram tracking delivery without a customer-side consent flag
-- Date: 2026-11-09
--
-- Telegram tracking links are sent from the platform's own authenticated account.
-- A customer does not need to start a bot or submit an in-app consent checkbox.
-- Delivery eligibility is determined by the merchant setting and phone number;
-- the worker then resolves the number using Telegram and sends only when a
-- matching Telegram account can actually be found.
--
-- The old consent metadata columns are intentionally left in place for
-- backwards compatibility with existing rows, but they are no longer gates.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_orders_create_telegram_outbox_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant_enabled BOOLEAN;
BEGIN
    -- A phone number is required to resolve the customer's Telegram account.
    IF NEW.customer_phone IS NULL OR TRIM(NEW.customer_phone) = '' THEN
        RETURN NEW;
    END IF;

    -- Keep the merchant's explicit feature switch as the delivery control.
    SELECT telegram_tracking_link_enabled INTO v_merchant_enabled
    FROM public.merchants
    WHERE id = NEW.merchant_id;

    IF v_merchant_enabled IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Enqueue exactly one tracking-link job for each newly inserted order.
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

-- Rebind the insert trigger to the updated function definition.
DROP TRIGGER IF EXISTS trg_orders_create_telegram_outbox_job ON public.orders;

CREATE TRIGGER trg_orders_create_telegram_outbox_job
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_orders_create_telegram_outbox_job();

COMMENT ON COLUMN public.orders.telegram_consent_at IS
  'Deprecated legacy metadata. Telegram tracking delivery no longer requires a customer consent timestamp.';
COMMENT ON COLUMN public.orders.telegram_consent_source IS
  'Deprecated legacy metadata. Not used by the Telegram tracking delivery pipeline.';
COMMENT ON COLUMN public.orders.telegram_consent_version IS
  'Deprecated legacy metadata. Not used by the Telegram tracking delivery pipeline.';
