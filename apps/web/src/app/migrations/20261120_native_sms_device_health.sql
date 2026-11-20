-- Store the latest authenticated, privacy-bounded health report for each native sender phone.
-- Apply once after the native SMS gateway migrations.

ALTER TABLE public.sms_gateway_devices
  ADD COLUMN IF NOT EXISTS health_report JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS health_reported_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.sms_gateway_devices'::regclass
       AND conname = 'sms_gateway_devices_health_report_is_object'
  ) THEN
    ALTER TABLE public.sms_gateway_devices
      ADD CONSTRAINT sms_gateway_devices_health_report_is_object
      CHECK (jsonb_typeof(health_report) = 'object');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sms_gateway_devices_health_reported
  ON public.sms_gateway_devices (merchant_id, health_reported_at DESC)
  WHERE merchant_id IS NOT NULL AND revoked_at IS NULL;

COMMENT ON COLUMN public.sms_gateway_devices.health_report IS
  'Latest schema-versioned native sender health snapshot. Contains only device/app diagnostics, permission booleans, relay state, connectivity and SIM counts; never phone numbers or SIM identifiers.';
COMMENT ON COLUMN public.sms_gateway_devices.health_reported_at IS
  'Server timestamp of the latest accepted authenticated health snapshot.';
