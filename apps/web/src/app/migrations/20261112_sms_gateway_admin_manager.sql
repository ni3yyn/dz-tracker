-- TajerTrack SMS gateway operations: platform control, device heartbeat and auditable admin actions.
-- Apply after 20261112_android_sms_gateway.sql.

CREATE TABLE IF NOT EXISTS public.sms_gateway_control (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

INSERT INTO public.sms_gateway_control (id, enabled)
VALUES ('primary', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sms_gateway_devices (
  device_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Android SIM gateway',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  last_claim_at TIMESTAMPTZ,
  last_result_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.sms_gateway_devices (device_id, display_name, enabled)
VALUES ('android-sms-gateway', 'Primary Android SIM gateway', TRUE)
ON CONFLICT (device_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sms_tracking_admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.sms_tracking_outbox(id) ON DELETE SET NULL,
  actor_id UUID,
  action TEXT NOT NULL CHECK (action IN (
    'retry_job',
    'force_retry_unknown',
    'pause_gateway',
    'resume_gateway',
    'disable_device',
    'enable_device'
  )),
  previous_status TEXT,
  new_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_gateway_devices_last_seen
  ON public.sms_gateway_devices (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_tracking_admin_events_created
  ON public.sms_tracking_admin_events (created_at DESC);

ALTER TABLE public.sms_gateway_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_gateway_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_tracking_admin_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sms_gateway_control FROM anon, authenticated;
REVOKE ALL ON public.sms_gateway_devices FROM anon, authenticated;
REVOKE ALL ON public.sms_tracking_admin_events FROM anon, authenticated;

GRANT ALL ON public.sms_gateway_control TO service_role;
GRANT ALL ON public.sms_gateway_devices TO service_role;
GRANT ALL ON public.sms_tracking_admin_events TO service_role;
