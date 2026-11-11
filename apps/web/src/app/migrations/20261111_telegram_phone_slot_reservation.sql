-- TajerTrack: serialize Telegram phone-resolution reservations across worker loops/processes.
-- Apply after 20261106_telegram_tracking_delivery.sql and 20261107_telegram_single_session_guard.sql.

CREATE OR REPLACE FUNCTION public.reserve_telegram_phone_resolution_slot(
  p_min_interval_ms INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_next_phone_at TIMESTAMPTZ;
  v_paused_until TIMESTAMPTZ;
  v_slot_at TIMESTAMPTZ;
  v_interval_ms INTEGER := GREATEST(COALESCE(p_min_interval_ms, 3500), 0);
BEGIN
  SELECT next_phone_resolution_at, paused_until
    INTO v_next_phone_at, v_paused_until
  FROM public.telegram_worker_state
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'telegram_worker_state singleton row (id=1) is missing';
  END IF;

  v_slot_at := GREATEST(
    clock_timestamp(),
    COALESCE(v_next_phone_at, '-infinity'::TIMESTAMPTZ),
    COALESCE(v_paused_until, '-infinity'::TIMESTAMPTZ)
  );

  UPDATE public.telegram_worker_state
  SET next_phone_resolution_at =
        v_slot_at + make_interval(secs => v_interval_ms::DOUBLE PRECISION / 1000.0),
      updated_at = clock_timestamp()
  WHERE id = 1;

  RETURN v_slot_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pause_telegram_worker_until(
  p_paused_until TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_paused_until IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telegram_worker_state
  SET paused_until = GREATEST(
        COALESCE(paused_until, '-infinity'::TIMESTAMPTZ),
        p_paused_until
      ),
      next_phone_resolution_at = GREATEST(
        COALESCE(next_phone_resolution_at, '-infinity'::TIMESTAMPTZ),
        p_paused_until
      ),
      updated_at = clock_timestamp()
  WHERE id = 1;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_telegram_phone_resolution_slot(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pause_telegram_worker_until(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_telegram_phone_resolution_slot(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pause_telegram_worker_until(TIMESTAMPTZ)
  TO service_role;

NOTIFY pgrst, 'reload schema';
