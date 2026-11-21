-- Security hardening: keep merchant and order data behind the server-only service_role.
-- Browser clients use Supabase Auth only; merchant data is accessed through authenticated server routes.
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.merchants FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.merchants TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.orders FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.orders TO service_role;

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.order_history FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.order_history TO service_role;

ALTER TABLE public.status_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_mappings FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.status_mappings FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.status_mappings TO service_role;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.subscription_payments FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.subscription_payments TO service_role;

-- Restrict privileged worker/status functions to the trusted server role.
REVOKE ALL PRIVILEGES ON FUNCTION public.record_order_status_change(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_status_change(uuid, text, text, text)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.claim_next_web_push_job(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_web_push_job(text, integer)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.increment_merchant_upsell_clicks(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_merchant_upsell_clicks(uuid)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.trg_fn_order_history_create_web_push_jobs()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_order_history_create_web_push_jobs()
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.trg_fn_orders_create_sms_tracking_job()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_orders_create_sms_tracking_job()
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.trg_fn_orders_refresh_sms_tracking_phone()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_orders_refresh_sms_tracking_phone()
  TO service_role;

ALTER FUNCTION public.record_order_status_change(uuid, text, text, text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.claim_next_web_push_job(text, integer)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.increment_merchant_upsell_clicks(uuid)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.exchange_normalize_text(text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.exchange_normalize_phone(text)
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_fn_order_history_create_web_push_jobs()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_fn_orders_create_sms_tracking_job()
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_fn_orders_refresh_sms_tracking_phone()
  SET search_path = pg_catalog, public, pg_temp;
