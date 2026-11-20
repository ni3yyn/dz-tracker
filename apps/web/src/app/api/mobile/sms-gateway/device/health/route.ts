import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

const RELAY_STATES = new Set([
  'connecting', 'connected', 'sending', 'reporting', 'retrying', 'offline',
  'paused', 'needs_repair', 'needs_pairing', 'needs_user_start', 'disabled',
  'attention', 'stopped',
]);

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function booleanValue(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function nullableCount(value: unknown, max: number): number | null | undefined {
  if (value === null) return null;
  if (boundedInteger(value, 0, max)) return value;
  return undefined;
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) || null;
}

function safeClientTimestamp(value: unknown, now: number): number {
  if (!boundedInteger(value, 0, now + 5 * 60_000)) return 0;
  return value;
}

/**
 * Accepts only the deliberately small, non-sensitive health contract.
 * No phone numbers, SIM identifiers, SMS contents, location, or credentials
 * are accepted or persisted.
 */
function sanitizeHealthReport(input: unknown, now: number): JsonRecord | null {
  const root = record(input);
  const device = record(root?.device);
  const connectivity = record(root?.connectivity);
  const permissions = record(root?.permissions);
  const relay = record(root?.relay);
  const sims = record(root?.sims);
  if (
    root?.reportVersion !== 1 ||
    !device || !connectivity || !permissions || !relay || !sims ||
    !booleanValue(connectivity.internetValidated) ||
    !booleanValue(permissions.sendSmsGranted) ||
    !booleanValue(permissions.phoneStateGranted) ||
    !booleanValue(permissions.notificationsGranted) ||
    !booleanValue(permissions.notificationsRequired) ||
    !booleanValue(relay.enabled) ||
    !booleanValue(relay.serviceRunning) ||
    typeof relay.connectionState !== 'string' ||
    !RELAY_STATES.has(relay.connectionState) ||
    !boundedInteger(relay.consecutiveFailures, 0, 10_000) ||
    !booleanValue(sims.alternateSimsEnabled) ||
    !boundedInteger(sims.enabledCount, 0, 2)
  ) {
    return null;
  }

  const activeCount = nullableCount(sims.activeCount, 10);
  const missingEnabledCount = nullableCount(sims.missingEnabledCount, 2);
  const apiLevel = nullableCount(device.apiLevel, 100);
  if (
    activeCount === undefined || missingEnabledCount === undefined ||
    !boundedInteger(device.apiLevel, 26, 100)
  ) {
    return null;
  }

  const appVersion = safeText(device.appVersion, 32);
  const model = safeText(device.model, 80);
  const androidRelease = safeText(device.androidRelease, 24);
  if (!appVersion || !model || !androidRelease) return null;

  return {
    reportVersion: 1,
    device: {
      appVersion,
      model,
      androidRelease,
      apiLevel,
    },
    connectivity: {
      internetValidated: connectivity.internetValidated,
    },
    permissions: {
      sendSmsGranted: permissions.sendSmsGranted,
      phoneStateGranted: permissions.phoneStateGranted,
      notificationsGranted: permissions.notificationsGranted,
      notificationsRequired: permissions.notificationsRequired,
    },
    relay: {
      enabled: relay.enabled,
      serviceRunning: relay.serviceRunning,
      connectionState: relay.connectionState,
      diagnosticMessage: safeText(relay.diagnosticMessage, 280) || '',
      statusUpdatedAt: safeClientTimestamp(relay.statusUpdatedAt, now),
      lastSuccessfulPollAt: safeClientTimestamp(relay.lastSuccessfulPollAt, now),
      consecutiveFailures: relay.consecutiveFailures,
    },
    sims: {
      activeCount,
      enabledCount: sims.enabledCount,
      missingEnabledCount,
      alternateSimsEnabled: sims.alternateSimsEnabled,
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const payload = record(body);
  const now = Date.now();
  const healthReport = sanitizeHealthReport(payload?.healthReport, now);
  if (!healthReport) {
    return NextResponse.json({ error: 'تقرير حالة الجهاز غير صالح.' }, { status: 400 });
  }

  const deviceInfo = healthReport.device as JsonRecord;
  const auth = await authenticateNativeSmsDevice(request, {
    appVersion: typeof deviceInfo.appVersion === 'string' ? deviceInfo.appVersion : null,
  });
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const reportedAt = new Date(now).toISOString();
  const minimumNextReport = new Date(now - 45_000).toISOString();
  const { data, error } = await auth.supabase
    .from('sms_gateway_devices')
    .update({
      health_report: healthReport,
      health_reported_at: reportedAt,
      device_model: deviceInfo.model,
    })
    .eq('device_id', auth.device.device_id)
    .eq('merchant_id', auth.device.merchant_id)
    .is('revoked_at', null)
    .or(`health_reported_at.is.null,health_reported_at.lt.${minimumNextReport}`)
    .select('device_id')
    .maybeSingle();

  if (error) {
    console.error('[NativeSmsGateway] Could not save sender device health:', error.message);
    return NextResponse.json({ error: 'تعذر حفظ تقرير حالة الجهاز حالياً.' }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    throttled: !data,
    reportedAt: data ? reportedAt : null,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
  });
}
