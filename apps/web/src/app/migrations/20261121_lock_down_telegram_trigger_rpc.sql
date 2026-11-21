-- The Telegram outbox trigger is invoked by PostgreSQL triggers, not by public RPC clients.
REVOKE ALL PRIVILEGES ON FUNCTION public.trg_fn_orders_create_telegram_outbox_job()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_orders_create_telegram_outbox_job()
  TO service_role;
ALTER FUNCTION public.trg_fn_orders_create_telegram_outbox_job()
  SET search_path = pg_catalog, public, pg_temp;
