-- Exchange replacement shipment lifecycle.
-- Replacement parcels are stored separately from orders: no second quota slot or Telegram job.
ALTER TABLE public.order_exchange_requests
  DROP CONSTRAINT IF EXISTS order_exchange_requests_status_check;

UPDATE public.order_exchange_requests
SET status = 'awaiting_shipment', updated_at = NOW()
WHERE status = 'approved';

ALTER TABLE public.order_exchange_requests
  ADD CONSTRAINT order_exchange_requests_status_check
  CHECK (status IN (
    'pending',
    'awaiting_shipment',
    'replacement_in_transit',
    'completed',
    'rejected'
  ));

DROP INDEX IF EXISTS public.order_exchange_requests_one_active_per_order;
CREATE UNIQUE INDEX order_exchange_requests_one_active_per_order
  ON public.order_exchange_requests(order_id)
  WHERE status IN ('pending', 'awaiting_shipment', 'replacement_in_transit');

CREATE OR REPLACE FUNCTION public.exchange_normalize_text(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(p_value, '')), '[[:space:][:punct:][:cntrl:]]+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.exchange_normalize_phone(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_phone TEXT := regexp_replace(COALESCE(p_value, ''), '[^0-9]', '', 'g');
BEGIN
  IF left(v_phone, 5) = '00213' THEN
    v_phone := '0' || substr(v_phone, 6);
  ELSIF left(v_phone, 3) = '213' AND length(v_phone) >= 12 THEN
    v_phone := '0' || substr(v_phone, 4);
  END IF;
  RETURN v_phone;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_exchange_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  exchange_request_id UUID REFERENCES public.order_exchange_requests(id) ON DELETE SET NULL,
  original_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  source_provider TEXT NOT NULL,
  carrier_name TEXT,
  external_order_id TEXT,
  carrier_tracking_number TEXT,
  carrier_order_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  product_name TEXT,
  current_status TEXT NOT NULL,
  status_title TEXT,
  carrier_metadata JSONB,
  match_status TEXT NOT NULL DEFAULT 'linked'
    CHECK (match_status IN ('linked', 'needs_confirmation')),
  possible_exchange_request_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  source_event_id TEXT,
  source_occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_exchange_shipments_linked_request_unique
    UNIQUE (exchange_request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS order_exchange_shipments_provider_order_unique
  ON public.order_exchange_shipments(merchant_id, source_provider, carrier_order_id)
  WHERE carrier_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS order_exchange_shipments_provider_tracking_unique
  ON public.order_exchange_shipments(merchant_id, source_provider, carrier_tracking_number)
  WHERE carrier_tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_exchange_shipments_confirmation
  ON public.order_exchange_shipments(merchant_id, created_at DESC)
  WHERE match_status = 'needs_confirmation';

CREATE INDEX IF NOT EXISTS idx_order_exchange_shipments_request
  ON public.order_exchange_shipments(exchange_request_id, created_at DESC)
  WHERE exchange_request_id IS NOT NULL;

ALTER TABLE public.order_exchange_shipments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_exchange_shipments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_exchange_shipments TO service_role;

-- Called before normal order resolution/insertion. A unique exact match is linked
-- automatically; ambiguous matches are persisted for merchant confirmation.
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
  -- Without a courier-scoped identity, safely leave this to the normal importer.
  IF NULLIF(btrim(p_carrier_order_id), '') IS NULL
     AND NULLIF(btrim(p_carrier_tracking_number), '') IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
    RETURN;
  END IF;

  -- Serialize duplicate provider events for the same incoming parcel.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_merchant_id::TEXT || ':' || v_provider || ':' ||
    COALESCE(NULLIF(p_carrier_order_id, ''), p_carrier_tracking_number, ''),
    0
  ));

  -- Existing linked or held shipment: route subsequent courier events here,
  -- never through orders or the Telegram tracking-link trigger.
  SELECT s.* INTO v_shipment
  FROM public.order_exchange_shipments s
  WHERE s.merchant_id = p_merchant_id
    AND s.source_provider = v_provider
    AND (
      (NULLIF(p_carrier_order_id, '') IS NOT NULL AND s.carrier_order_id = p_carrier_order_id)
      OR
      (NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND s.carrier_tracking_number = p_carrier_tracking_number)
    )
  ORDER BY CASE WHEN NULLIF(p_carrier_order_id, '') IS NOT NULL AND s.carrier_order_id = p_carrier_order_id THEN 0 ELSE 1 END
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
    AND public.exchange_normalize_text(o.product_name) = v_product;

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
        (NULLIF(p_carrier_order_id, '') IS NOT NULL AND s.carrier_order_id = p_carrier_order_id)
        OR (NULLIF(p_carrier_tracking_number, '') IS NOT NULL AND s.carrier_tracking_number = p_carrier_tracking_number)
      )
    LIMIT 1;
  END IF;

  RETURN QUERY SELECT TRUE, v_shipment_id, NULL::UUID, NULL::UUID, NULL::UUID, TRUE, FALSE;
END;
$$;

-- Merchant review is transactional with the customer push notification event.
CREATE OR REPLACE FUNCTION public.review_order_exchange_request(
  p_request_id UUID,
  p_merchant_id UUID,
  p_status TEXT,
  p_merchant_response TEXT DEFAULT NULL
)
RETURNS SETOF public.order_exchange_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.order_exchange_requests%ROWTYPE;
  v_current_status TEXT;
  v_title TEXT;
BEGIN
  IF p_status NOT IN ('awaiting_shipment', 'rejected') THEN
    RAISE EXCEPTION 'Invalid exchange request decision';
  END IF;

  SELECT r.* INTO v_request
  FROM public.order_exchange_requests r
  WHERE r.id = p_request_id AND r.merchant_id = p_merchant_id AND r.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.order_exchange_requests
  SET status = p_status,
      merchant_response = NULLIF(btrim(p_merchant_response), ''),
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  SELECT o.current_status INTO v_current_status
  FROM public.orders o WHERE o.id = v_request.order_id;

  v_title := CASE WHEN p_status = 'awaiting_shipment'
    THEN 'وافق المتجر على طلب الاستبدال'
    ELSE 'رفض المتجر طلب الاستبدال'
  END;

  INSERT INTO public.order_history(order_id, status_raw, status_title, description, event_type, created_at)
  VALUES (
    v_request.order_id,
    COALESCE(v_current_status, 'delivered'),
    v_title,
    COALESCE(v_request.merchant_response, CASE WHEN p_status = 'awaiting_shipment'
      THEN 'وافق المتجر على طلب الاستبدال. تابع المستجدات من رابط التتبع.'
      ELSE 'راجع رد المتجر في صفحة التتبع.' END),
    'status_changed',
    NOW()
  );

  RETURN NEXT v_request;
END;
$$;

-- Resolve an ambiguous candidate only against one of the exact matches stored
-- at ingestion time. This cannot attach a parcel to an unrelated request.
CREATE OR REPLACE FUNCTION public.confirm_order_exchange_shipment_match(
  p_shipment_id UUID,
  p_exchange_request_id UUID,
  p_merchant_id UUID
)
RETURNS SETOF public.order_exchange_shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipment public.order_exchange_shipments%ROWTYPE;
  v_request public.order_exchange_requests%ROWTYPE;
  v_tracking_uuid UUID;
  v_next_status TEXT;
BEGIN
  SELECT s.* INTO v_shipment
  FROM public.order_exchange_shipments s
  WHERE s.id = p_shipment_id AND s.merchant_id = p_merchant_id
    AND s.match_status = 'needs_confirmation'
    AND p_exchange_request_id = ANY(s.possible_exchange_request_ids)
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT r.* INTO v_request
  FROM public.order_exchange_requests r
  WHERE r.id = p_exchange_request_id AND r.merchant_id = p_merchant_id
    AND r.status = 'awaiting_shipment'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  v_next_status := CASE WHEN lower(COALESCE(v_shipment.current_status, '')) = 'delivered'
    THEN 'completed' ELSE 'replacement_in_transit' END;

  UPDATE public.order_exchange_shipments
  SET exchange_request_id = v_request.id,
      original_order_id = v_request.order_id,
      match_status = 'linked',
      possible_exchange_request_ids = '{}'::UUID[],
      updated_at = NOW()
  WHERE id = v_shipment.id
  RETURNING * INTO v_shipment;

  UPDATE public.order_exchange_requests
  SET status = v_next_status, updated_at = NOW()
  WHERE id = v_request.id;

  SELECT o.tracking_uuid INTO v_tracking_uuid
  FROM public.orders o WHERE o.id = v_request.order_id;

  INSERT INTO public.order_history(order_id, status_raw, status_title, description, event_type, created_at)
  VALUES (
    v_request.order_id,
    v_shipment.current_status,
    CASE WHEN v_next_status = 'completed'
      THEN 'تم تسليم المنتج البديل واكتمل الاستبدال'
      ELSE 'تم ربط شحنة الاستبدال: ' || COALESCE(NULLIF(v_shipment.status_title, ''), v_shipment.current_status) END,
    'تم ربط الشحنة البديلة بصفحة التتبع الأصلية.',
    'status_changed',
    COALESCE(v_shipment.source_occurred_at, NOW())
  );

  RETURN NEXT v_shipment;
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_normalize_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exchange_normalize_phone(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_exchange_replacement_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_order_exchange_request(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_order_exchange_shipment_match(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_normalize_text(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_normalize_phone(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_exchange_replacement_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_order_exchange_request(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_order_exchange_shipment_match(UUID, UUID, UUID) TO service_role;
