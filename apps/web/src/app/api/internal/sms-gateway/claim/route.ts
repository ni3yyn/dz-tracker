import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { authorizeSmsGatewayRequest, SMS_GATEWAY_WORKER_ID } from '../../../../../lib/sms-gateway-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeAlgerianMobilePhone(input: string | null): string | null {
  if (!input) return null;
  let value = input.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('213')) value = `+${value}`;
  if (/^0[5-7]\d{8}$/.test(value)) value = `+213${value.slice(1)}`;
  return /^\+213[5-7]\d{8}$/.test(value) ? value : null;
}

async function releaseJobForRetry(supabase: any, jobId: string, reason: string): Promise<void> {
  await supabase
    .from('sms_tracking_outbox')
    .update({
      status: 'retry',
      available_at: new Date(Date.now() + 60_000).toISOString(),
      result_code: 'pre_send_backend_error',
      last_error: reason.slice(0, 500),
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .eq('locked_by', SMS_GATEWAY_WORKER_ID);
}

async function skipJob(supabase: any, jobId: string, reason: string): Promise<void> {
  await supabase
    .from('sms_tracking_outbox')
    .update({
      status: 'skipped',
      result_code: reason,
      last_error: reason,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .eq('locked_by', SMS_GATEWAY_WORKER_ID);
}

export async function POST(request: Request) {
  const auth = authorizeSmsGatewayRequest(request);
  if (auth.ok === false) {
    return NextResponse.json(
      { error: auth.reason === 'not_configured' ? 'SMS gateway is not configured.' : 'Unauthorized.' },
      { status: auth.reason === 'not_configured' ? 503 : 401 }
    );
  }

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();

    // Every authenticated poll acts as a heartbeat, including while the
    // platform gateway or this device is paused.
    // Update the heartbeat and read the device switch in one PostgREST
    // round-trip instead of a SELECT followed by an UPDATE on every poll.
    const { data: device, error: deviceHeartbeatError } = await (supabase as any)
      .from('sms_gateway_devices')
      .update({ last_seen_at: now, updated_at: now })
      .eq('device_id', SMS_GATEWAY_WORKER_ID)
      .select('device_id, enabled')
      .maybeSingle();

    if (deviceHeartbeatError || !device) {
      console.error('[SmsGateway] Device registry/heartbeat is unavailable:', deviceHeartbeatError?.message || 'Device not registered.');
      return NextResponse.json({ error: 'SMS gateway device is not registered.' }, { status: 503 });
    }

    if (device.enabled !== true) {
      return NextResponse.json({ job: null, deviceDisabled: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: control, error: controlError } = await (supabase as any)
      .from('sms_gateway_control')
      .select('enabled')
      .eq('id', 'primary')
      .maybeSingle();

    if (controlError || !control) {
      console.error('[SmsGateway] Platform control is unavailable:', controlError?.message || 'Control row missing.');
      return NextResponse.json({ error: 'SMS gateway control is not configured.' }, { status: 503 });
    }

    if (control.enabled !== true) {
      return NextResponse.json({ job: null, gatewayPaused: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data, error } = await (supabase as any).rpc('claim_next_sms_tracking_job', {
      p_worker_id: SMS_GATEWAY_WORKER_ID,
      p_lease_seconds: 180,
    });

    if (error) {
      console.error('[SmsGateway] Could not claim an SMS job:', error.message);
      return NextResponse.json({ error: 'Could not claim an SMS job.' }, { status: 503 });
    }

    const job = Array.isArray(data) ? data[0] : data;
    if (!job) return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });

    await (supabase as any)
      .from('sms_gateway_devices')
      .update({ last_claim_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('device_id', SMS_GATEWAY_WORKER_ID);

    const { data: order, error: orderError } = await (supabase as any)
      .from('orders')
      .select('id, merchant_id, customer_phone, tracking_uuid')
      .eq('id', job.order_id)
      .maybeSingle();

    if (orderError) {
      console.error('[SmsGateway] Could not read the claimed order:', orderError.message);
      await releaseJobForRetry(supabase, job.id, orderError.message);
      return NextResponse.json({ error: 'Could not read the claimed order.' }, { status: 503 });
    }
    if (!order?.tracking_uuid) {
      await skipJob(supabase, job.id, 'order_or_tracking_link_missing');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: merchant, error: merchantError } = await (supabase as any)
      .from('merchants')
      .select('store_name, sms_tracking_enabled')
      .eq('id', order.merchant_id)
      .maybeSingle();

    if (merchantError) {
      console.error('[SmsGateway] Could not read merchant SMS settings:', merchantError.message);
      await releaseJobForRetry(supabase, job.id, merchantError.message);
      return NextResponse.json({ error: 'Could not read merchant settings.' }, { status: 503 });
    }
    if (!merchant || merchant.sms_tracking_enabled !== true) {
      await skipJob(supabase, job.id, 'merchant_sms_disabled');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const phone = normalizeAlgerianMobilePhone(order.customer_phone);
    if (!phone) {
      await skipJob(supabase, job.id, 'invalid_algerian_mobile_number');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const baseUrl = (
      process.env.TRACKING_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://tajertrack.vercel.app'
    ).replace(/\/+$/, '');
    const trackingUrl = `${baseUrl}/t/${encodeURIComponent(order.tracking_uuid)}`;

    // GSM-7-only text keeps a normal TajerTrack URL comfortably inside one
    // 160-character SMS segment, avoiding the 70-character Unicode limit.
    const message = `TajerTrack - Suivez votre commande: ${trackingUrl}`;

    return NextResponse.json({
      job: {
        id: job.id,
        phone,
        message,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[SmsGateway] Claim endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'SMS gateway claim failed.' }, { status: 500 });
  }
}
