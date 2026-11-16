-- End-to-end PostgreSQL smoke test for the two legacy SMS migrations and the native gateway migration.
-- Run this file in a dedicated empty test database; it intentionally uses real migration files.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.merchants (
  id UUID PRIMARY KEY,
  store_name TEXT NOT NULL,
  sms_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  customer_phone TEXT
);

\ir ../../src/app/migrations/20261112_android_sms_gateway.sql
\ir ../../src/app/migrations/20261112_sms_gateway_admin_manager.sql
\ir ../../src/app/migrations/20261112_native_sms_gateway.sql
\ir ../../src/app/migrations/20261116_sms_carrier_routing.sql

INSERT INTO public.merchants (id, store_name, sms_tracking_enabled) VALUES
  ('10000000-0000-4000-8000-000000000010', 'Native merchant', TRUE),
  ('10000000-0000-4000-8000-000000000011', 'Legacy merchant', TRUE);

INSERT INTO public.orders (id, merchant_id, customer_phone) VALUES
  ('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', '0550000010'),
  ('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', '0550000011'),
  ('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000011', '0550000012');

-- Simulate a legacy Termux job already held when the merchant pairs the native phone.
UPDATE public.sms_tracking_outbox
   SET status = 'processing',
       locked_by = 'android-sms-gateway',
       locked_at = NOW(),
       lease_expires_at = NOW() + INTERVAL '3 minutes',
       attempt_count = 1
 WHERE order_id = '30000000-0000-4000-8000-000000000010';

INSERT INTO public.sms_gateway_pairing_codes (code_hash, merchant_id, created_by, expires_at)
VALUES (
  encode(digest('native-pair-code-1', 'sha256'), 'hex'),
  '10000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000010',
  NOW() + INTERVAL '5 minutes'
);

DO $$
DECLARE
  v_pairing RECORD;
  v_job public.sms_tracking_outbox%ROWTYPE;
  v_poll JSONB;
BEGIN
  SELECT * INTO v_pairing
    FROM public.complete_native_sms_gateway_pairing(
      encode(digest('native-pair-code-1', 'sha256'), 'hex'),
      'native-device-1',
      repeat('a', 64),
      'aaaa',
      'Test Android phone',
      'android',
      '0.1.0'
    );

  IF NOT FOUND OR v_pairing.blocked IS DISTINCT FROM FALSE OR v_pairing.store_name <> 'Native merchant' THEN
    RAISE EXCEPTION 'Native pairing did not return the expected merchant/device result: %', row_to_json(v_pairing);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000010'
       AND status = 'unknown'
       AND locked_by IS NULL
  ) THEN
    RAISE EXCEPTION 'In-flight legacy SMS job was not converted to unknown at pairing';
  END IF;

  -- Pairing codes are single-use and cannot mint a second credential.
  SELECT * INTO v_pairing
    FROM public.complete_native_sms_gateway_pairing(
      encode(digest('native-pair-code-1', 'sha256'), 'hex'),
      'native-device-replay',
      repeat('d', 64),
      'dddd',
      'Replay phone',
      'android',
      '0.1.0'
    );
  IF FOUND OR EXISTS (SELECT 1 FROM public.sms_gateway_devices WHERE device_id = 'native-device-replay') THEN
    RAISE EXCEPTION 'A consumed pairing code was accepted more than once';
  END IF;

  -- The global Termux worker must skip the paired merchant but continue serving other merchants.
  SELECT * INTO v_job
    FROM public.claim_next_sms_tracking_job('android-sms-gateway', 180)
   LIMIT 1;
  IF NOT FOUND OR v_job.merchant_id <> '10000000-0000-4000-8000-000000000011' THEN
    RAISE EXCEPTION 'Legacy worker claimed the wrong merchant after native pairing: %', row_to_json(v_job);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000011'
       AND status = 'pending'
       AND locked_by IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy worker changed the native merchant pending job';
  END IF;

  -- The paired phone can claim that merchant's own pending job via the token-hash poll RPC.
  SELECT public.poll_native_sms_gateway(repeat('a', 64), '0.1.0', 180) INTO v_poll;
  IF v_poll->>'deviceId' <> 'native-device-1' OR v_poll->>'merchantId' <> '10000000-0000-4000-8000-000000000010' THEN
    RAISE EXCEPTION 'Native poll did not authenticate the paired phone: %', v_poll;
  END IF;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000011' THEN
    RAISE EXCEPTION 'Native phone claimed the wrong order: %', v_poll;
  END IF;

  -- An admin-disabled phone is a hold. A merchant-generated replacement code must not bypass it.
  UPDATE public.sms_gateway_devices
     SET enabled = FALSE
   WHERE device_id = 'native-device-1';

  -- A paused device keeps its credential and receives a clear pause response;
  -- it must not be mistaken for a revoked/unknown phone.
  SELECT public.poll_native_sms_gateway(repeat('a', 64), '0.1.0', 180) INTO v_poll;
  IF v_poll->>'deviceDisabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Admin-paused phone did not retain its pairing status: %', v_poll;
  END IF;

  INSERT INTO public.sms_gateway_pairing_codes (code_hash, merchant_id, created_by, expires_at)
  VALUES (
    encode(digest('native-pair-code-blocked', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    NOW() + INTERVAL '5 minutes'
  );

  SELECT * INTO v_pairing
    FROM public.complete_native_sms_gateway_pairing(
      encode(digest('native-pair-code-blocked', 'sha256'), 'hex'),
      'native-device-2-blocked',
      repeat('b', 64),
      'bbbb',
      'Replacement phone',
      'android',
      '0.1.0'
    );
  IF NOT FOUND OR v_pairing.blocked IS DISTINCT FROM TRUE OR v_pairing.device_id IS NOT NULL THEN
    RAISE EXCEPTION 'Admin-disabled native phone was not protected from merchant replacement: %', row_to_json(v_pairing);
  END IF;
  IF EXISTS (SELECT 1 FROM public.sms_gateway_devices WHERE device_id = 'native-device-2-blocked') THEN
    RAISE EXCEPTION 'Blocked pairing unexpectedly created another native device';
  END IF;

  -- An administrator may re-enable the old phone; after that, a new pairing can safely replace it.
  UPDATE public.sms_gateway_devices
     SET enabled = TRUE
   WHERE device_id = 'native-device-1';
  INSERT INTO public.sms_gateway_pairing_codes (code_hash, merchant_id, created_by, expires_at)
  VALUES (
    encode(digest('native-pair-code-2', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    NOW() + INTERVAL '5 minutes'
  );

  SELECT * INTO v_pairing
    FROM public.complete_native_sms_gateway_pairing(
      encode(digest('native-pair-code-2', 'sha256'), 'hex'),
      'native-device-2',
      repeat('c', 64),
      'cccc',
      'Replacement phone',
      'android',
      '0.1.0'
    );
  IF NOT FOUND OR v_pairing.blocked IS DISTINCT FROM FALSE OR v_pairing.device_id <> 'native-device-2' THEN
    RAISE EXCEPTION 'Admin-authorized phone replacement failed: %', row_to_json(v_pairing);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sms_gateway_devices
     WHERE device_id = 'native-device-1'
       AND revoked_at IS NOT NULL
       AND enabled IS FALSE
  ) THEN
    RAISE EXCEPTION 'Previous phone was not revoked during replacement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000011'
       AND status = 'unknown'
       AND locked_by IS NULL
  ) THEN
    RAISE EXCEPTION 'In-flight job claimed by the replaced native phone was not marked unknown';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Native SMS gateway migration and merchant-isolation tests passed.';
END $$;


-- Carrier routing: exact prefix mapping, one sender line per operator, and
-- tenant isolation when a line is replaced while legacy jobs are in flight.
DO $$
DECLARE
  v_pairing RECORD;
  v_poll JSONB;
BEGIN
  IF public.detect_algerian_mobile_operator('0550000099') <> 'ooredoo'
     OR public.detect_algerian_mobile_operator('+213550000099') <> 'ooredoo'
     OR public.detect_algerian_mobile_operator('00213660000099') <> 'mobilis'
     OR public.detect_algerian_mobile_operator('0770000099') <> 'djezzy'
     OR public.detect_algerian_mobile_operator('12345') IS NOT NULL THEN
    RAISE EXCEPTION 'Algerian carrier prefix normalization failed';
  END IF;

  INSERT INTO public.orders (id, merchant_id, customer_phone) VALUES
    ('30000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', '0770000013'),
    ('30000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', '+213660000014'),
    ('30000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000010', '00213550000015');

  IF (SELECT recipient_operator FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000013') <> 'djezzy'
     OR (SELECT recipient_operator FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000014') <> 'mobilis'
     OR (SELECT recipient_operator FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000015') <> 'ooredoo' THEN
    RAISE EXCEPTION 'New SMS outbox jobs were not assigned to the correct carrier';
  END IF;

  INSERT INTO public.sms_gateway_pairing_codes (code_hash, merchant_id, created_by, operator_code, expires_at)
  VALUES
    (encode(digest('carrier-djezzy', 'sha256'), 'hex'), '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'djezzy', NOW() + INTERVAL '5 minutes'),
    (encode(digest('carrier-mobilis', 'sha256'), 'hex'), '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'mobilis', NOW() + INTERVAL '5 minutes'),
    (encode(digest('carrier-ooredoo', 'sha256'), 'hex'), '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'ooredoo', NOW() + INTERVAL '5 minutes');

  SELECT * INTO v_pairing FROM public.complete_native_sms_gateway_pairing(
    encode(digest('carrier-djezzy', 'sha256'), 'hex'), 'carrier-device-djezzy', repeat('e', 64), 'eeee', 'Djezzy phone', 'android', '0.2.0'
  );
  IF NOT FOUND OR v_pairing.operator_code <> 'djezzy' OR v_pairing.device_id <> 'carrier-device-djezzy' THEN
    RAISE EXCEPTION 'Djezzy sender line pairing failed: %', row_to_json(v_pairing);
  END IF;

  -- Replacing the Djezzy slot must not affect another merchant's legacy lease.
  IF NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000012'
       AND status = 'processing'
       AND locked_by = 'android-sms-gateway'
  ) THEN
    RAISE EXCEPTION 'Pairing a Djezzy line changed another merchant legacy job';
  END IF;

  SELECT * INTO v_pairing FROM public.complete_native_sms_gateway_pairing(
    encode(digest('carrier-mobilis', 'sha256'), 'hex'), 'carrier-device-mobilis', repeat('f', 64), 'ffff', 'Mobilis phone', 'android', '0.2.0'
  );
  IF NOT FOUND OR v_pairing.operator_code <> 'mobilis' THEN
    RAISE EXCEPTION 'Mobilis sender line pairing failed: %', row_to_json(v_pairing);
  END IF;

  SELECT * INTO v_pairing FROM public.complete_native_sms_gateway_pairing(
    encode(digest('carrier-ooredoo', 'sha256'), 'hex'), 'carrier-device-ooredoo', repeat('9', 64), '9999', 'Ooredoo phone', 'android', '0.2.0'
  );
  IF NOT FOUND OR v_pairing.operator_code <> 'ooredoo' THEN
    RAISE EXCEPTION 'Ooredoo sender line pairing failed: %', row_to_json(v_pairing);
  END IF;

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.2.0', 180) INTO v_poll;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000013' THEN
    RAISE EXCEPTION 'Djezzy device claimed a non-Djezzy customer job: %', v_poll;
  END IF;

  SELECT public.poll_native_sms_gateway(repeat('f', 64), '0.2.0', 180) INTO v_poll;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000014' THEN
    RAISE EXCEPTION 'Mobilis device claimed a non-Mobilis customer job: %', v_poll;
  END IF;

  SELECT public.poll_native_sms_gateway(repeat('9', 64), '0.2.0', 180) INTO v_poll;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000015' THEN
    RAISE EXCEPTION 'Ooredoo device claimed a non-Ooredoo customer job: %', v_poll;
  END IF;

  IF (SELECT COUNT(*) FROM public.sms_gateway_devices
       WHERE merchant_id = '10000000-0000-4000-8000-000000000010'
         AND operator_code IS NOT NULL
         AND enabled = TRUE
         AND revoked_at IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Expected all three independent carrier sender lines to remain active';
  END IF;

  -- The old unscoped reconnect flow must not replace all carrier-specific lines.
  INSERT INTO public.sms_gateway_pairing_codes (code_hash, merchant_id, created_by, expires_at)
  VALUES (
    encode(digest('legacy-reconnect-after-carriers', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    NOW() + INTERVAL '5 minutes'
  );
  SELECT * INTO v_pairing FROM public.complete_native_sms_gateway_pairing(
    encode(digest('legacy-reconnect-after-carriers', 'sha256'), 'hex'),
    'legacy-reconnect-device',
    repeat('8', 64),
    '8888',
    'Legacy reconnect phone',
    'android',
    '0.2.0'
  );
  IF NOT FOUND OR v_pairing.blocked IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Legacy unscoped pairing was not blocked after carrier lines were configured';
  END IF;
  IF (SELECT COUNT(*) FROM public.sms_gateway_devices
       WHERE merchant_id = '10000000-0000-4000-8000-000000000010'
         AND operator_code IS NOT NULL
         AND enabled = TRUE
         AND revoked_at IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Legacy reconnect unexpectedly removed a carrier-specific sender line';
  END IF;
END $;
