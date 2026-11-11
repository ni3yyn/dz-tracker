-- Allow explicitly TajerTrack-created orders to match approved exchanges without a courier parcel number.
-- Carrier webhook events still require a courier-scoped parcel identity.
CREATE UNIQUE INDEX IF NOT EXISTS order_exchange_shipments_manual_order_unique
  ON public.order_exchange_shipments(merchant_id, external_order_id)
  WHERE source_provider = 'manual' AND external_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_exchange_replacement_event(
  p_merchant_id UUID,
  p_source_provider TEXT,
  p_carrier_name TEXT,
  p_external_order_id TEXT,
  p_carrier_tracking_number TEXT,
  p_carrier_order_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_product_name TEXT,
  p_status_raw TEXT,
  p_status_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_carrier_metadata JSONB DEFAULT NULL,
  p_source_event_id TEXT DEFAULT NULL,
  p_source_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_suppress_triggers BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  handled BOOLEAN,
  shipment_id UUID,
  exchange_request_id UUID,
  original_order_id UUID,
  tracking_uuid UUID,
  needs_confirmation BOOLEAN,
  status_changed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT := COALESCE(NULLIF(btrim(p_source_provider), ''), NULLIF(btrim(p_carrier_name), ''), 'unknown');
  v_is_manual BOOLEAN := lower(btrim(COALESCE(p_source_provider, ''))) = 'manual';
  v_carrier TEXT := NULLIF(btrim(p_carrier_name), '');
  v_phone TEXT := public.exchange_normalize_phone(p_customer_phone);
  v_name TEXT := public.exchange_normalize_text(p_customer_name);
  v_product TEXT := public.exchange_normalize_text(p_product_name);
  v_matches UUID[] := '{}'::UUID[];
  v_match_count INTEGER := 0;
  v_request_id UUID;
  v_order_id UUID;
  v_tracking_uuid UUID;
  v_shipment public.order_exchange_shipments%ROWTYPE;
  v_shipment_id UUID;
  v_changed BOOLEAN := FALSE;
  v_title TEXT;
  v_description TEXT;
  v_next_status TEXT;
BEGIN
  -- Carrier events still require a courier-scoped identity. Orders explicitly
  -- created inside TajerTrack can instead use their own stable external order ID.
  IF v_is_manual THEN
    IF NULLIF(btrim(p_external_order_id), '') IS NULL THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
      RETURN;
    END IF;
  ELSIF NULLIF(btrim(p_carrier_order_id), '') IS NULL
     AND NULLIF(btrim(p_carrier_tracking_number), '') IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
    RETURN;
  END IF;

  -- Serialize duplicate events by the strongest identity available.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_merchant_id::TEXT || ':' || v_provider || ':' ||
    COALESCE(
      CASE WHEN v_is_manual THEN NULLIF(btrim(p_external_order_id), '') END,
      NULLIF(btrim(p_carrier_order_id), ''),
      NULLIF(btrim(p_carrier_tracking_number), ''),
      ''
    ),
    0
  ));

  -- Existing linked or held shipment: route subsequent courier events here,
  -- never through orders or the Telegram tracking-link trigger.
  SELECT s.* INTO v_shipment
  FROM public.order_exchange_shipments s
  WHERE s.merchant_id = p_merchant_id
    AND (
      (
        v_is_manual
        AND s.source_provider = 'manual'
        AND NULLIF(btrim(p_external_order_id), '') IS NOT NULL
        AND s.external_order_id = p_external_order_id
      )
      OR
      (
        NOT v_is_manual
        AND s.source_provider IN (v_provider, 'manual')
        AND (
          (NULLIF(p_carrier_order_id, '') IS NOT NULL AND s.carrier_order_id = p_carrier_order_id)
          OR
          (NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND s.carrier_tracking_number = p_carrier_tracking_number)
          OR
          (
            -- A later courier sync can enrich a manual exchange entry that was
            -- created before the carrier assigned its parcel identifiers.
            s.source_provider = 'manual'
            AND s.match_status = 'linked'
            AND s.carrier_tracking_number IS NULL
            AND s.carrier_order_id IS NULL
            AND public.exchange_normalize_text(s.carrier_name) = public.exchange_normalize_text(v_carrier)
            AND public.exchange_normalize_phone(s.customer_phone) = v_phone
            AND public.exchange_normalize_text(s.customer_name) = v_name
            AND public.exchange_normalize_text(s.product_name) = v_product
            AND NOT EXISTS (
              SELECT 1
              FROM public.orders original_order
              WHERE original_order.merchant_id = p_merchant_id
                AND (
                  v_carrier IS NULL
                  OR public.exchange_normalize_text(original_order.carrier_name) = public.exchange_normalize_text(v_carrier)
                )
                AND (
                  (NULLIF(p_carrier_order_id, '') IS NOT NULL AND original_order.carrier_order_id = p_carrier_order_id)
                  OR
                  (NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND original_order.carrier_tracking_number = p_carrier_tracking_number)
                )
            )
            AND EXISTS (
              SELECT 1
              FROM public.order_exchange_requests er
              WHERE er.id = s.exchange_request_id
                AND er.merchant_id = s.merchant_id
                AND er.status IN ('replacement_in_transit', 'completed')
            )
            AND (
              SELECT COUNT(*)
              FROM public.order_exchange_shipments sx
              JOIN public.order_exchange_requests ex
                ON ex.id = sx.exchange_request_id AND ex.merchant_id = sx.merchant_id
              WHERE sx.merchant_id = p_merchant_id
                AND sx.source_provider = 'manual'
                AND sx.match_status = 'linked'
                AND sx.carrier_tracking_number IS NULL
                AND sx.carrier_order_id IS NULL
                AND ex.status IN ('replacement_in_transit', 'completed')
                AND public.exchange_normalize_text(sx.carrier_name) = public.exchange_normalize_text(v_carrier)
                AND public.exchange_normalize_phone(sx.customer_phone) = v_phone
                AND public.exchange_normalize_text(sx.customer_name) = v_name
                AND public.exchange_normalize_text(sx.product_name) = v_product
            ) = 1
          )
        )
      )
    )
  ORDER BY CASE
    WHEN NULLIF(p_carrier_order_id, '') IS NOT NULL AND s.carrier_order_id = p_carrier_order_id THEN 0
    WHEN NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND s.carrier_tracking_number = p_carrier_tracking_number THEN 1
    ELSE 2
  END
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_source_occurred_at IS NOT NULL
       AND v_shipment.source_occurred_at IS NOT NULL
       AND p_source_occurred_at < v_shipment.source_occurred_at THEN
      SELECT o.tracking_uuid INTO v_tracking_uuid
      FROM public.orders o WHERE o.id = v_shipment.original_order_id;
      RETURN QUERY SELECT TRUE, v_shipment.id, v_shipment.exchange_request_id,
        v_shipment.original_order_id, v_tracking_uuid,
        v_shipment.match_status = 'needs_confirmation', FALSE;
      RETURN;
    END IF;

    v_changed := v_shipment.current_status IS DISTINCT FROM p_status_raw;
    UPDATE public.order_exchange_shipments
    SET current_status = COALESCE(NULLIF(p_status_raw, ''), current_status),
        status_title = COALESCE(NULLIF(p_status_title, ''), status_title),
        carrier_tracking_number = COALESCE(NULLIF(p_carrier_tracking_number, ''), carrier_tracking_number),
        carrier_order_id = COALESCE(NULLIF(p_carrier_order_id, ''), carrier_order_id),
        external_order_id = COALESCE(NULLIF(p_external_order_id, ''), external_order_id),
        customer_name = COALESCE(NULLIF(p_customer_name, ''), customer_name),
        customer_phone = COALESCE(NULLIF(p_customer_phone, ''), customer_phone),
        product_name = COALESCE(NULLIF(p_product_name, ''), product_name),
        carrier_metadata = COALESCE(p_carrier_metadata, carrier_metadata),
        source_event_id = COALESCE(p_source_event_id, source_event_id),
        source_occurred_at = COALESCE(p_source_occurred_at, source_occurred_at),
        updated_at = NOW()
    WHERE id = v_shipment.id;

    IF v_shipment.match_status = 'linked' THEN
      SELECT o.tracking_uuid INTO v_tracking_uuid
      FROM public.orders o WHERE o.id = v_shipment.original_order_id;

      IF v_changed THEN
        v_next_status := CASE WHEN lower(COALESCE(p_status_raw, '')) = 'delivered'
          THEN 'completed' ELSE 'replacement_in_transit' END;
        UPDATE public.order_exchange_requests
        SET status = v_next_status, updated_at = NOW()
        WHERE id = v_shipment.exchange_request_id
          AND status IN ('awaiting_shipment', 'replacement_in_transit', 'completed');

        IF NOT p_suppress_triggers AND v_shipment.original_order_id IS NOT NULL THEN
          v_title := CASE WHEN v_next_status = 'completed'
            THEN 'تم تسليم المنتج البديل واكتمل الاستبدال'
            ELSE 'الاستبدال: ' || COALESCE(NULLIF(p_status_title, ''), p_status_raw)
          END;
          v_description := COALESCE(NULLIF(p_description, ''), 'تحديث على شحنة الاستبدال');
          INSERT INTO public.order_history(order_id, status_raw, status_title, description, event_type, created_at)
          VALUES (v_shipment.original_order_id, p_status_raw, v_title, v_description, 'status_changed', COALESCE(p_source_occurred_at, NOW()));
        END IF;
      END IF;

      RETURN QUERY SELECT TRUE, v_shipment.id, v_shipment.exchange_request_id,
        v_shipment.original_order_id, v_tracking_uuid, FALSE, v_changed;
      RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, v_shipment.id, NULL::UUID, NULL::UUID, NULL::UUID, TRUE, v_changed;
    RETURN;
  END IF;

  -- Do not mistake a replayed event for the original delivered parcel as a replacement.
  -- Repeated events for already-linked replacement parcels were handled above.
  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.merchant_id = p_merchant_id
      AND (
        v_carrier IS NULL
        OR lower(btrim(COALESCE(o.carrier_name, ''))) = lower(btrim(v_carrier))
      )
      AND (
        (v_is_manual AND NULLIF(btrim(p_external_order_id), '') IS NOT NULL AND o.external_order_id = p_external_order_id)
        OR
        (NULLIF(p_carrier_order_id, '') IS NOT NULL AND o.carrier_order_id = p_carrier_order_id)
        OR
        (NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND o.carrier_tracking_number = p_carrier_tracking_number)
      )
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
    RETURN;
  END IF;

  -- Match only when all three customer/product identifiers are present and
  -- equal after conservative normalization, within this merchant's account.
  IF length(v_phone) < 8 OR v_name = '' OR v_product = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER, COALESCE(array_agg(r.id), '{}'::UUID[])
  INTO v_match_count, v_matches
  FROM public.order_exchange_requests r
  JOIN public.orders o ON o.id = r.order_id AND o.merchant_id = r.merchant_id
  WHERE r.merchant_id = p_merchant_id
    AND r.status = 'awaiting_shipment'
    AND public.exchange_normalize_phone(o.customer_phone) = v_phone
    AND public.exchange_normalize_text(o.customer_name) = v_name
    AND public.exchange_normalize_text(o.product_name) = v_product
    AND (
      NOT v_is_manual
      OR (
        v_carrier IS NOT NULL
        AND public.exchange_normalize_text(o.carrier_name) = public.exchange_normalize_text(v_carrier)
      )
    );

  IF v_match_count = 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
    RETURN;
  END IF;

  IF v_match_count = 1 THEN
    v_request_id := v_matches[1];
    SELECT r.order_id INTO v_order_id
    FROM public.order_exchange_requests r
    WHERE r.id = v_request_id AND r.merchant_id = p_merchant_id
    FOR UPDATE;

    INSERT INTO public.order_exchange_shipments(
      merchant_id, exchange_request_id, original_order_id, source_provider,
      carrier_name, external_order_id, carrier_tracking_number, carrier_order_id,
      customer_name, customer_phone, product_name, current_status, status_title,
      carrier_metadata, match_status, source_event_id, source_occurred_at
    ) VALUES (
      p_merchant_id, v_request_id, v_order_id, v_provider, v_carrier,
      p_external_order_id, p_carrier_tracking_number, p_carrier_order_id,
      p_customer_name, p_customer_phone, p_product_name, p_status_raw, p_status_title,
      p_carrier_metadata, 'linked', p_source_event_id, p_source_occurred_at
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_shipment_id;

    IF v_shipment_id IS NULL THEN
      SELECT s.* INTO v_shipment
      FROM public.order_exchange_shipments s
      WHERE s.merchant_id = p_merchant_id
        AND s.exchange_request_id = v_request_id
      LIMIT 1 FOR UPDATE;
      IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
        RETURN;
      END IF;
      v_shipment_id := v_shipment.id;
    END IF;

    v_next_status := CASE WHEN lower(COALESCE(p_status_raw, '')) = 'delivered'
      THEN 'completed' ELSE 'replacement_in_transit' END;
    UPDATE public.order_exchange_requests
    SET status = v_next_status, updated_at = NOW()
    WHERE id = v_request_id AND status = 'awaiting_shipment';

    SELECT o.tracking_uuid INTO v_tracking_uuid
    FROM public.orders o WHERE o.id = v_order_id;

    IF NOT p_suppress_triggers THEN
      v_title := CASE WHEN v_next_status = 'completed'
        THEN 'تم تسليم المنتج البديل واكتمل الاستبدال'
        ELSE 'تم ربط شحنة الاستبدال: ' || COALESCE(NULLIF(p_status_title, ''), p_status_raw)
      END;
      v_description := COALESCE(NULLIF(p_description, ''), 'تتم متابعة شحنة الاستبدال من رابط التتبع الأصلي.');
      INSERT INTO public.order_history(order_id, status_raw, status_title, description, event_type, created_at)
      VALUES (v_order_id, p_status_raw, v_title, v_description, 'status_changed', COALESCE(p_source_occurred_at, NOW()));
    END IF;

    RETURN QUERY SELECT TRUE, v_shipment_id, v_request_id, v_order_id, v_tracking_uuid, FALSE, TRUE;
    RETURN;
  END IF;

  -- Multiple exact matches: retain the parcel and ask the merchant to choose.
  INSERT INTO public.order_exchange_shipments(
    merchant_id, source_provider, carrier_name, external_order_id,
    carrier_tracking_number, carrier_order_id, customer_name, customer_phone,
    product_name, current_status, status_title, carrier_metadata,
    match_status, possible_exchange_request_ids, source_event_id, source_occurred_at
  ) VALUES (
    p_merchant_id, v_provider, v_carrier, p_external_order_id,
    p_carrier_tracking_number, p_carrier_order_id, p_customer_name, p_customer_phone,
    p_product_name, p_status_raw, p_status_title, p_carrier_metadata,
    'needs_confirmation', v_matches, p_source_event_id, p_source_occurred_at
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_shipment_id;

  IF v_shipment_id IS NULL THEN
    SELECT s.id INTO v_shipment_id
    FROM public.order_exchange_shipments s
    WHERE s.merchant_id = p_merchant_id AND s.source_provider = v_provider
      AND (
        (v_is_manual AND s.source_provider = 'manual' AND s.external_order_id = p_external_order_id)
        OR
        (NULLIF(p_carrier_order_id, '') IS NOT NULL AND s.carrier_order_id = p_carrier_order_id)
        OR (NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND s.carrier_tracking_number = p_carrier_tracking_number)
      )
    LIMIT 1;
  END IF;

  RETURN QUERY SELECT TRUE, v_shipment_id, NULL::UUID, NULL::UUID, NULL::UUID, TRUE, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_exchange_replacement_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_exchange_replacement_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, BOOLEAN) TO service_role;
