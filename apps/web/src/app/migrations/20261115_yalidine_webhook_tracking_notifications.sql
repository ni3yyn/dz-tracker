-- =============================================================================
-- Yalidine / Guepex: send tracking-link notifications when a parcel is created
-- or linked to an order that already exists in TajerTrack.
--
-- The normal SMS and Telegram outboxes are still the only delivery pipelines.
-- This RPC complements the orders AFTER INSERT triggers with an idempotent
-- enqueue path for carrier-originated parcel_created / parcel_edited webhooks.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_yalidine_tracking_notifications(
  p_merchant_id UUID,
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_sms_enabled BOOLEAN := FALSE;
  v_telegram_enabled BOOLEAN := FALSE;
  v_phone_digits TEXT;
  v_sms_rows INTEGER := 0;
  v_telegram_rows INTEGER := 0;
  v_sms_queued BOOLEAN := FALSE;
  v_telegram_queued BOOLEAN := FALSE;
BEGIN
  SELECT *
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     AND merchant_id = p_merchant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yalidine notification target order does not belong to the merchant.';
  END IF;

  SELECT
    COALESCE(sms_tracking_enabled, FALSE),
    COALESCE(telegram_tracking_link_enabled, FALSE)
    INTO v_sms_enabled, v_telegram_enabled
    FROM public.merchants
   WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yalidine notification merchant was not found.';
  END IF;

  -- A masked number such as 0********9 is not a usable SMS/Telegram target.
  -- A real phone already saved on the matched TajerTrack order remains usable.
  v_phone_digits := regexp_replace(COALESCE(v_order.customer_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone_digits) < 8 THEN
    RETURN jsonb_build_object(
      'smsQueued', FALSE,
      'telegramQueued', FALSE,
      'phoneAvailable', FALSE,
      'reason', 'missing_or_masked_customer_phone'
    );
  END IF;

  IF v_sms_enabled THEN
    INSERT INTO public.sms_tracking_outbox (
      order_id,
      merchant_id,
      idempotency_key,
      status,
      available_at
    )
    VALUES (
      v_order.id,
      p_merchant_id,
      'sms:tracking-link:' || v_order.id::TEXT,
      'pending',
      NOW()
    )
    ON CONFLICT (order_id) DO NOTHING;

    GET DIAGNOSTICS v_sms_rows = ROW_COUNT;

    -- A prior job skipped only because SMS was disabled or its phone was
    -- invalid can safely be retried now. Never resend submitted/unknown jobs.
    IF v_sms_rows = 0 THEN
      UPDATE public.sms_tracking_outbox
         SET status = 'pending',
             attempt_count = 0,
             available_at = NOW(),
             locked_by = NULL,
             locked_at = NULL,
             lease_expires_at = NULL,
             last_error = NULL,
             result_code = NULL,
             submitted_at = NULL,
             updated_at = NOW()
       WHERE order_id = v_order.id
         AND merchant_id = p_merchant_id
         AND status = 'skipped'
         AND result_code IN ('merchant_sms_disabled', 'invalid_phone', 'missing_phone');

      GET DIAGNOSTICS v_sms_rows = ROW_COUNT;
    END IF;

    v_sms_queued := v_sms_rows > 0;
  END IF;

  IF v_telegram_enabled THEN
    INSERT INTO public.telegram_tracking_outbox (
      order_id,
      merchant_id,
      idempotency_key,
      status,
      available_at
    )
    VALUES (
      v_order.id,
      p_merchant_id,
      'telegram:tracking-link:' || v_order.id::TEXT,
      'pending',
      NOW()
    )
    ON CONFLICT (order_id) DO NOTHING;

    GET DIAGNOSTICS v_telegram_rows = ROW_COUNT;

    -- Only known non-delivery outcomes may be reopened. Sent jobs and jobs
    -- with uncertain delivery are intentionally never resent.
    IF v_telegram_rows = 0 THEN
      UPDATE public.telegram_tracking_outbox
         SET status = 'pending',
             attempt_count = 0,
             available_at = NOW(),
             locked_by = NULL,
             locked_at = NULL,
             lease_expires_at = NULL,
             telegram_random_id = NULL,
             telegram_user_id = NULL,
             telegram_message_id = NULL,
             result_code = NULL,
             last_error_code = NULL,
             last_error_message = NULL,
             sent_at = NULL,
             updated_at = NOW()
       WHERE order_id = v_order.id
         AND merchant_id = p_merchant_id
         AND status = 'skipped'
         AND result_code IN ('merchant_disabled', 'invalid_phone');

      GET DIAGNOSTICS v_telegram_rows = ROW_COUNT;
    END IF;

    v_telegram_queued := v_telegram_rows > 0;
  END IF;

  RETURN jsonb_build_object(
    'smsQueued', v_sms_queued,
    'telegramQueued', v_telegram_queued,
    'phoneAvailable', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_yalidine_tracking_notifications(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_yalidine_tracking_notifications(UUID, UUID)
  TO service_role;
