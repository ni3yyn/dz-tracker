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
