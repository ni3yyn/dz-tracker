-- One-shot request for enabled sender phones to publish a fresh health snapshot.
ALTER TABLE public.sms_gateway_devices
  ADD COLUMN IF NOT EXISTS health_refresh_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.sms_gateway_devices.health_refresh_requested_at IS
  'Pending manager request for the sender phone to publish a fresh authenticated health snapshot. Cleared only by the matching report.';
