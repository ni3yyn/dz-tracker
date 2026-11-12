-- Admin-only, read-only database size metric for the Supabase usage monitor.
-- Uses the same pg_database_size aggregation recommended in Supabase's database-size guide.

CREATE OR REPLACE FUNCTION public.admin_get_database_size()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH database_usage AS (
    SELECT COALESCE(SUM(pg_catalog.pg_database_size(datname)), 0)::bigint AS bytes
    FROM pg_catalog.pg_database
  )
  SELECT jsonb_build_object(
    'bytes', bytes::text,
    'pretty', pg_catalog.pg_size_pretty(bytes)
  )
  FROM database_usage;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_database_size() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_database_size() FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_database_size() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_database_size() TO service_role;
