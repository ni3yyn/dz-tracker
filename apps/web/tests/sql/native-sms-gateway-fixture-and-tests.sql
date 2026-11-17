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
  customer_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\ir ../../src/app/migrations/20261112_android_sms_gateway.sql
\ir ../../src/app/migrations/20261112_sms_gateway_admin_manager.sql
\ir ../../src/app/migrations/20261112_native_sms_gateway.sql
\ir ../../src/app/migrations/20261116_sms_carrier_routing.sql
\ir ../../src/app/migrations/20261117_native_sms_reliability.sql
\ir ../../src/app/migrations/20261117_preserve_manager_sender_on_invite.sql

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
       dispatch_started_at = NOW(),
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
  v_claim_token UUID;
  v_dispatch_started BOOLEAN;
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

  -- The old unscoped pairing is safely assigned to its selected primary
  -- SIM before it can claim carrier-specific customer jobs.
  IF public.assign_native_sms_gateway_legacy_operator(repeat('a', 64), 'ooredoo') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Legacy phone could not be classified from its selected Ooredoo SIM';
  END IF;

  -- The paired phone can claim only its own carrier's pending job.
  SELECT public.poll_native_sms_gateway(repeat('a', 64), '0.1.0', 180, TRUE) INTO v_poll;
  IF v_poll->>'deviceId' <> 'native-device-1' OR v_poll->>'merchantId' <> '10000000-0000-4000-8000-000000000010' THEN
    RAISE EXCEPTION 'Native poll did not authenticate the paired phone: %', v_poll;
  END IF;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000011' THEN
    RAISE EXCEPTION 'Native phone claimed the wrong order: %', v_poll;
  END IF;

  v_claim_token := (v_poll #>> '{job,claim_token}')::UUID;
  SELECT public.begin_native_sms_job_dispatch(
    (v_poll #>> '{job,id}')::UUID,
    '10000000-0000-4000-8000-000000000010',
    'native-device-1',
    v_claim_token
  ) INTO v_dispatch_started;
  IF v_dispatch_started IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The legacy phone could not mark its SMS dispatch start';
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
  INSERT INTO public.sms_gateway_pairing_codes (code_hash, merchant_id, created_by, expires_at, operator_code)
  VALUES (
    encode(digest('native-pair-code-2', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    NOW() + INTERVAL '5 minutes',
    'ooredoo'
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
     OR public.detect_algerian_mobile_operator('00213550000099') <> 'ooredoo'
     OR public.detect_algerian_mobile_operator('213550000099') <> 'ooredoo'
     OR public.detect_algerian_mobile_operator('00213660000099') <> 'mobilis'
     OR public.detect_algerian_mobile_operator('0770000099') <> 'djezzy'
     OR public.detect_algerian_mobile_operator('12345') IS NOT NULL THEN
    RAISE EXCEPTION 'Algerian carrier prefix normalization failed';
  END IF;

  INSERT INTO public.orders (id, merchant_id, customer_phone) VALUES
    ('30000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', '0770000013'),
    ('30000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', '+213660000014'),
    ('30000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000010', '00213550000015'),
    ('30000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000010', '12345');

  IF (SELECT recipient_operator FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000013') <> 'djezzy'
     OR (SELECT recipient_operator FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000014') <> 'mobilis'
     OR (SELECT recipient_operator FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000015') <> 'ooredoo' THEN
    RAISE EXCEPTION 'New SMS outbox jobs were not assigned to the correct carrier';
  END IF;
  IF (SELECT status FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000016') <> 'skipped'
     OR (SELECT result_code FROM public.sms_tracking_outbox WHERE order_id = '30000000-0000-4000-8000-000000000016') <> 'unsupported_recipient_network' THEN
    RAISE EXCEPTION 'Unsupported customer number was left pending instead of being explicitly skipped';
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
END $$;


-- Single-use relative invitations and merchant pause/revoke controls.
DO $$
DECLARE
  v_invite RECORD;
  v_ok BOOLEAN;
BEGIN
  INSERT INTO public.sms_gateway_device_invites (
    token_hash, merchant_id, created_by, operator_code, expires_at
  )
  VALUES (
    encode(digest('one-time-relay-invite', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    'mobilis',
    NOW() + INTERVAL '30 minutes'
  );

  SELECT * INTO v_invite
    FROM public.redeem_native_sms_gateway_invite(
      encode(digest('one-time-relay-invite', 'sha256'), 'hex'),
      encode(digest('one-time-pairing-code', 'sha256'), 'hex')
    );

  IF NOT FOUND
     OR v_invite.merchant_id <> '10000000-0000-4000-8000-000000000010'
     OR v_invite.operator_code <> 'mobilis'
     OR v_invite.store_name <> 'Native merchant' THEN
    RAISE EXCEPTION 'Carrier-scoped relative invitation redemption failed: %', row_to_json(v_invite);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sms_gateway_pairing_codes
     WHERE code_hash = encode(digest('one-time-pairing-code', 'sha256'), 'hex')
       AND merchant_id = '10000000-0000-4000-8000-000000000010'
       AND operator_code = 'mobilis'
       AND consumed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Invitation did not create its five-minute scoped pairing code';
  END IF;

  SELECT * INTO v_invite
    FROM public.redeem_native_sms_gateway_invite(
      encode(digest('one-time-relay-invite', 'sha256'), 'hex'),
      encode(digest('invite-replay-code', 'sha256'), 'hex')
    );
  IF FOUND OR EXISTS (
    SELECT 1 FROM public.sms_gateway_pairing_codes
     WHERE code_hash = encode(digest('invite-replay-code', 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'A redeemed carrier invitation was accepted more than once';
  END IF;

  SELECT public.set_native_sms_gateway_device_enabled(
    '10000000-0000-4000-8000-000000000010',
    'carrier-device-djezzy',
    FALSE
  ) INTO v_ok;
  IF v_ok IS DISTINCT FROM TRUE OR EXISTS (
    SELECT 1 FROM public.sms_gateway_devices
     WHERE device_id = 'carrier-device-djezzy'
       AND enabled = TRUE
  ) THEN
    RAISE EXCEPTION 'Merchant could not pause one carrier line';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000013'
       AND status <> 'unknown'
  ) THEN
    RAISE EXCEPTION 'Pausing a sender line did not preserve its uncertain in-flight send as unknown';
  END IF;

  SELECT public.set_native_sms_gateway_device_enabled(
    '10000000-0000-4000-8000-000000000010',
    'carrier-device-djezzy',
    TRUE
  ) INTO v_ok;
  IF v_ok IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM public.sms_gateway_devices
     WHERE device_id = 'carrier-device-djezzy'
       AND enabled = TRUE
       AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Merchant could not re-enable its paused carrier line';
  END IF;

  SELECT public.revoke_native_sms_gateway_device(
    '10000000-0000-4000-8000-000000000010',
    'carrier-device-mobilis'
  ) INTO v_ok;
  IF v_ok IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM public.sms_gateway_devices
     WHERE device_id = 'carrier-device-mobilis'
       AND enabled = FALSE
       AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Merchant revocation did not invalidate the selected carrier device';
  END IF;
END $$;


-- Reliability: 72-hour expiry, number corrections, safe pre-dispatch recovery,
-- dispatch ambiguity, and pause preservation.
DO $$
DECLARE
  v_poll JSONB;
  v_claim_token UUID;
  v_result BOOLEAN;
  v_status TEXT;
BEGIN
  -- Correcting a phone before dispatch recalculates its carrier and keeps the
  -- original order's 72-hour deadline.
  INSERT INTO public.orders (id, merchant_id, customer_phone)
  VALUES (
    '30000000-0000-4000-8000-000000000017',
    '10000000-0000-4000-8000-000000000010',
    '0770000017'
  );

  UPDATE public.orders
     SET customer_phone = '0660000017'
   WHERE id = '30000000-0000-4000-8000-000000000017';

  IF NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000017'
       AND recipient_operator = 'mobilis'
       AND status = 'pending'
       AND dispatch_started_at IS NULL
       AND expires_at <= created_at + INTERVAL '72 hours'
       AND expires_at > created_at + INTERVAL '71 hours'
  ) THEN
    RAISE EXCEPTION 'A corrected customer phone was not re-routed to its new carrier within the original 72-hour window';
  END IF;

  -- Pausing the merchant preference does not discard already queued work.
  UPDATE public.merchants
     SET sms_tracking_enabled = FALSE
   WHERE id = '10000000-0000-4000-8000-000000000010';

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.3.0', 180, TRUE) INTO v_poll;
  IF v_poll->>'merchantDisabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'The native gateway did not honor the merchant SMS pause: %', v_poll;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000017'
       AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Merchant SMS pause discarded a previously queued order';
  END IF;

  UPDATE public.merchants
     SET sms_tracking_enabled = TRUE
   WHERE id = '10000000-0000-4000-8000-000000000010';

  -- An unsubmitted claim that expires is safely returned to retry, without
  -- increasing the actual dispatch-attempt count or becoming unknown.
  INSERT INTO public.orders (id, merchant_id, customer_phone)
  VALUES (
    '30000000-0000-4000-8000-000000000018',
    '10000000-0000-4000-8000-000000000010',
    '0770000018'
  );

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.3.0', 180, TRUE) INTO v_poll;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000018' THEN
    RAISE EXCEPTION 'A Djezzy phone did not claim its matching pending SMS: %', v_poll;
  END IF;

  SELECT (v_poll #>> '{job,claim_token}')::UUID INTO v_claim_token;
  UPDATE public.sms_tracking_outbox
     SET lease_expires_at = NOW() - INTERVAL '1 second'
   WHERE order_id = '30000000-0000-4000-8000-000000000018';

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.3.0', 180, TRUE) INTO v_poll;

  SELECT status INTO v_status
    FROM public.sms_tracking_outbox
   WHERE order_id = '30000000-0000-4000-8000-000000000018';

  IF v_status <> 'retry' OR EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000018'
       AND (locked_by IS NOT NULL OR claim_token IS NOT NULL OR attempt_count <> 0)
  ) THEN
    RAISE EXCEPTION 'A claim that expired before dispatch was not safely re-queued: %', v_status;
  END IF;

  -- Once the explicit dispatch handshake is recorded, an expired lease must
  -- become unknown rather than retry and risk a duplicate customer SMS.
  INSERT INTO public.orders (id, merchant_id, customer_phone)
  VALUES (
    '30000000-0000-4000-8000-000000000019',
    '10000000-0000-4000-8000-000000000010',
    '0770000019'
  );

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.3.0', 180, TRUE) INTO v_poll;
  IF v_poll #>> '{job,order_id}' <> '30000000-0000-4000-8000-000000000019' THEN
    RAISE EXCEPTION 'The next Djezzy job was not claimed after pre-dispatch recovery: %', v_poll;
  END IF;
  SELECT (v_poll #>> '{job,claim_token}')::UUID INTO v_claim_token;

  SELECT public.begin_native_sms_job_dispatch(
    (v_poll #>> '{job,id}')::UUID,
    '10000000-0000-4000-8000-000000000010',
    'carrier-device-djezzy',
    v_claim_token
  ) INTO v_result;

  IF v_result IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM public.sms_tracking_outbox
     WHERE order_id = '30000000-0000-4000-8000-000000000019'
       AND dispatch_started_at IS NOT NULL
       AND attempt_count = 1
  ) THEN
    RAISE EXCEPTION 'The explicit SMS dispatch handshake did not record the attempt';
  END IF;

  UPDATE public.sms_tracking_outbox
     SET lease_expires_at = NOW() - INTERVAL '1 second'
   WHERE order_id = '30000000-0000-4000-8000-000000000019';

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.3.0', 180, TRUE) INTO v_poll;
  SELECT status INTO v_status
    FROM public.sms_tracking_outbox
   WHERE order_id = '30000000-0000-4000-8000-000000000019';

  IF v_status <> 'unknown' THEN
    RAISE EXCEPTION 'A possibly submitted SMS was automatically retried after its lease expired';
  END IF;

  -- An unsent job older than 72 hours is explicitly expired, never sent late.
  INSERT INTO public.orders (id, merchant_id, customer_phone)
  VALUES (
    '30000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000010',
    '0770000020'
  );
  UPDATE public.sms_tracking_outbox
     SET expires_at = NOW() - INTERVAL '1 second'
   WHERE order_id = '30000000-0000-4000-8000-000000000020';

  SELECT public.poll_native_sms_gateway(repeat('e', 64), '0.3.0', 180, TRUE) INTO v_poll;
  SELECT status INTO v_status
    FROM public.sms_tracking_outbox
   WHERE order_id = '30000000-0000-4000-8000-000000000020';

  IF v_status <> 'expired' THEN
    RAISE EXCEPTION 'An SMS older than the 72-hour delivery window was not expired';
  END IF;
END $$;

-- Adding/replacing an invited carrier line must never revoke the manager phone's
-- neutral primary sender profile. Only the matching carrier slot is replaced.
DO $$
DECLARE
  v_pairing RECORD;
BEGIN
  INSERT INTO public.sms_gateway_devices (
    device_id, display_name, merchant_id, enabled, token_hash, token_last_four,
    platform, app_version, device_model, operator_code, connected_at, last_seen_at
  )
  VALUES (
    'manager-primary-neutral',
    'Main manager phone',
    '10000000-0000-4000-8000-000000000010',
    TRUE,
    repeat('8', 64),
    '8888',
    'android',
    '1.0.28',
    'Main manager phone',
    NULL,
    NOW(),
    NOW()
  );

  INSERT INTO public.sms_gateway_pairing_codes (
    code_hash, merchant_id, created_by, operator_code, expires_at
  )
  VALUES (
    encode(digest('carrier-ooredoo-replacement', 'sha256'), 'hex'),
    '10000000-0000-4000-8000-000000000010',
    '20000000-0000-4000-8000-000000000010',
    'ooredoo',
    NOW() + INTERVAL '5 minutes'
  );

  SELECT * INTO v_pairing
    FROM public.complete_native_sms_gateway_pairing(
      encode(digest('carrier-ooredoo-replacement', 'sha256'), 'hex'),
      'carrier-device-ooredoo-replacement',
      repeat('7', 64),
      '7777',
      'Replacement Ooredoo phone',
      'android',
      '1.0.28'
    );

  IF NOT FOUND
     OR v_pairing.blocked IS DISTINCT FROM FALSE
     OR v_pairing.operator_code <> 'ooredoo' THEN
    RAISE EXCEPTION 'Ooredoo sender replacement failed: %', row_to_json(v_pairing);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices
     WHERE device_id = 'manager-primary-neutral'
       AND enabled IS TRUE
       AND revoked_at IS NULL
       AND operator_code IS NULL
  ) THEN
    RAISE EXCEPTION 'Adding an invited carrier line revoked the manager phone primary sender profile';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices
     WHERE device_id = 'carrier-device-ooredoo'
       AND enabled IS FALSE
       AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Ooredoo replacement did not revoke the previous Ooredoo sender';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.sms_gateway_devices
     WHERE device_id = 'carrier-device-djezzy'
       AND enabled IS TRUE
       AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Adding an Ooredoo line changed the Djezzy sender slot';
  END IF;
END $$;



-- Extend the isolated test fixture for the current polling function's account
-- eligibility check, then install the production fallback migration.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  deleted_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ
);
ALTER TABLE public.merchants ADD COLUMN auth_user_id UUID;
UPDATE public.merchants
   SET auth_user_id = CASE
     WHEN id = '10000000-0000-4000-8000-000000000010'
       THEN '20000000-0000-4000-8000-000000000010'::UUID
     ELSE '20000000-0000-4000-8000-000000000011'::UUID
   END;
INSERT INTO auth.users (id) VALUES
  ('20000000-0000-4000-8000-000000000010'),
  ('20000000-0000-4000-8000-000000000011');

\ir ../../src/app/migrations/20261117_sms_gateway_single_line_fallback.sql

-- One neutral manager SIM must be able to serve every operator when no
-- dedicated carrier line is enabled.
DO $$
DECLARE
  v_poll JSONB;
  v_operator TEXT;
  v_job_id UUID;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_index INTEGER;
BEGIN
  UPDATE public.sms_gateway_devices
     SET enabled = FALSE
   WHERE merchant_id = '10000000-0000-4000-8000-000000000010'
     AND operator_code IS NOT NULL
     AND revoked_at IS NULL;

  UPDATE public.sms_tracking_outbox
     SET status = 'skipped',
         result_code = 'fallback_test_reset',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE merchant_id = '10000000-0000-4000-8000-000000000010'
     AND status IN ('pending', 'retry');

  INSERT INTO public.orders (id, merchant_id, customer_phone) VALUES
    ('30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000010', '0770000021'),
    ('30000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000010', '0660000022'),
    ('30000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000010', '0550000023');

  FOR v_index IN 1..3 LOOP
    SELECT public.poll_native_sms_gateway(
      p_token_hash => repeat('8', 64),
      p_app_version => '1.0.30',
      p_lease_seconds => 180,
      p_dispatch_protocol => TRUE,
      p_operator_code => 'ooredoo',
      p_allow_cross_network_fallback => TRUE
    ) INTO v_poll;

    v_job_id := NULLIF(v_poll #>> '{job,id}', '')::UUID;
    v_operator := v_poll #>> '{job,recipient_operator}';
    IF v_job_id IS NULL OR v_operator IS NULL THEN
      RAISE EXCEPTION 'The single manager SIM could not claim all three carrier jobs: %', v_poll;
    END IF;
    IF v_operator = ANY(v_seen) THEN
      RAISE EXCEPTION 'The single manager SIM claimed the same carrier twice before covering all three: %', v_seen;
    END IF;
    IF v_operator <> 'ooredoo' AND v_poll->>'crossNetworkFallback' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'A cross-network manager claim was not marked as fallback: %', v_poll;
    END IF;

    v_seen := array_append(v_seen, v_operator);
    UPDATE public.sms_tracking_outbox
       SET status = 'submitted',
           locked_by = NULL,
           locked_at = NULL,
           lease_expires_at = NULL,
           claim_token = NULL,
           updated_at = NOW()
     WHERE id = v_job_id;
  END LOOP;

  IF NOT ('djezzy' = ANY(v_seen) AND 'mobilis' = ANY(v_seen) AND 'ooredoo' = ANY(v_seen)) THEN
    RAISE EXCEPTION 'The single manager SIM did not cover all supported operators: %', v_seen;
  END IF;
END $$;

-- A dedicated enabled Ooredoo line takes priority. The neutral main phone
-- continues to cover only the other operators, while the Ooredoo phone
-- continues to claim its own network.
DO $$
DECLARE
  v_poll JSONB;
  v_operator TEXT;
  v_job_id UUID;
BEGIN
  UPDATE public.sms_gateway_devices
     SET enabled = FALSE
   WHERE merchant_id = '10000000-0000-4000-8000-000000000010'
     AND operator_code IS NOT NULL
     AND revoked_at IS NULL;
  UPDATE public.sms_gateway_devices
     SET enabled = TRUE
   WHERE device_id = 'carrier-device-ooredoo-replacement'
     AND merchant_id = '10000000-0000-4000-8000-000000000010'
     AND revoked_at IS NULL;

  INSERT INTO public.orders (id, merchant_id, customer_phone) VALUES
    ('30000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000010', '0770000024'),
    ('30000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000010', '0660000025'),
    ('30000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000010', '0550000026');

  SELECT public.poll_native_sms_gateway(
    p_token_hash => repeat('8', 64),
    p_app_version => '1.0.30',
    p_lease_seconds => 180,
    p_dispatch_protocol => TRUE,
    p_operator_code => 'ooredoo',
    p_allow_cross_network_fallback => FALSE
  ) INTO v_poll;
  IF v_poll->'job' IS NOT NULL AND v_poll->'job' <> 'null'::JSONB THEN
    RAISE EXCEPTION 'The manager phone claimed an Ooredoo job already covered by a dedicated enabled line: %', v_poll;
  END IF;

  SELECT public.poll_native_sms_gateway(
    p_token_hash => repeat('8', 64),
    p_app_version => '1.0.30',
    p_lease_seconds => 180,
    p_dispatch_protocol => TRUE,
    p_operator_code => 'ooredoo',
    p_allow_cross_network_fallback => TRUE
  ) INTO v_poll;
  v_job_id := NULLIF(v_poll #>> '{job,id}', '')::UUID;
  v_operator := v_poll #>> '{job,recipient_operator}';
  IF v_job_id IS NULL OR v_operator NOT IN ('djezzy', 'mobilis')
     OR v_poll->>'crossNetworkFallback' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'The manager fallback did not restrict itself to unpaired operators: %', v_poll;
  END IF;
  UPDATE public.sms_tracking_outbox
     SET status = 'submitted',
         locked_by = NULL,
         locked_at = NULL,
         lease_expires_at = NULL,
         claim_token = NULL,
         updated_at = NOW()
   WHERE id = v_job_id;

  SELECT public.poll_native_sms_gateway(
    p_token_hash => repeat('7', 64),
    p_app_version => '1.0.30',
    p_lease_seconds => 180,
    p_dispatch_protocol => TRUE,
    p_operator_code => 'ooredoo',
    p_allow_cross_network_fallback => FALSE
  ) INTO v_poll;
  v_operator := v_poll #>> '{job,recipient_operator}';
  IF v_operator <> 'ooredoo' THEN
    RAISE EXCEPTION 'The dedicated Ooredoo sender did not retain priority for its network: %', v_poll;
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Single-line all-network fallback and dedicated-line priority tests passed.';
END $$;
