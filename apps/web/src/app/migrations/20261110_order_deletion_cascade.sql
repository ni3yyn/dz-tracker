-- TajerTrack: make order deletion remove records that belong exclusively to that order.
-- This covers order history, confirmation/tracking outboxes, and order-device links.
-- Dependent children of those records already cascade from their immediate parent.

DO $$
DECLARE
  v_fk RECORD;
  v_definition TEXT;
BEGIN
  FOR v_fk IN
    SELECT
      con.oid,
      con.conname,
      con.conrelid::regclass AS child_table,
      con.confdeltype
    FROM pg_constraint AS con
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.orders'::regclass
  LOOP
    -- 'c' is PostgreSQL's CASCADE delete action.
    IF v_fk.confdeltype <> 'c' THEN
      v_definition := pg_get_constraintdef(v_fk.oid);

      -- Remove the previous delete action, preserving the FK columns,
      -- referenced key, update action, and deferrability.
      v_definition := regexp_replace(
        v_definition,
        '\s+ON DELETE (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)',
        '',
        'i'
      );

      -- Place ON DELETE before DEFERRABLE / NOT DEFERRABLE when present.
      v_definition := regexp_replace(
        v_definition,
        '\s+(NOT )?DEFERRABLE',
        ' ON DELETE CASCADE \1DEFERRABLE',
        'i'
      );

      IF v_definition !~* '\s+ON DELETE\s+' THEN
        v_definition := v_definition || ' ON DELETE CASCADE';
      END IF;

      EXECUTE format(
        'ALTER TABLE %s DROP CONSTRAINT %I',
        v_fk.child_table,
        v_fk.conname
      );

      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I %s',
        v_fk.child_table,
        v_fk.conname,
        v_definition
      );
    END IF;
  END LOOP;
END;
$$;


-- 2. Atomic, merchant-scoped deletion. The server action passes only the
-- merchant ID resolved from the authenticated user's session.
CREATE OR REPLACE FUNCTION public.delete_merchant_orders(
  p_merchant_id UUID,
  p_order_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned_count INTEGER;
  v_deleted_count INTEGER;
BEGIN
  IF p_merchant_id IS NULL OR p_order_ids IS NULL OR cardinality(p_order_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- All-or-nothing ownership guard: do not delete any rows if one ID is
  -- missing or belongs to another merchant.
  SELECT COUNT(*)
  INTO v_owned_count
  FROM public.orders
  WHERE merchant_id = p_merchant_id
    AND id = ANY(p_order_ids);

  IF v_owned_count <> cardinality(p_order_ids) THEN
    RETURN -1;
  END IF;

  DELETE FROM public.orders
  WHERE merchant_id = p_merchant_id
    AND id = ANY(p_order_ids);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_merchant_orders(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_merchant_orders(UUID, UUID[]) TO service_role;
