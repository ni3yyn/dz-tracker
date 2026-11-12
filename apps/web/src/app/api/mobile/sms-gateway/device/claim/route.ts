import { NextResponse } from 'next/server';
import { authenticateNativeSmsDevice } from '../../../../../../lib/native-sms-gateway-auth';

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

async function skipJob(supabase: any, jobId: string, deviceId: string, reason: string) {
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
    .eq('locked_by', deviceId);
}

async function releaseClaimedJobForRetry(supabase: any, jobId: string, deviceId: string, reason: string) {
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
    .eq('locked_by', deviceId);
}

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const appVersion = typeof body?.appVersion === 'string' ? body.appVersion : null;
  const auth = await authenticateNativeSmsDevice(request, { appVersion });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { supabase, device } = auth;
    const now = new Date().toISOString();

    const { data: control, error: controlError } = await supabase
      .from('sms_gateway_control')
      .select('enabled')
      .eq('id', 'primary')
      .maybeSingle();

    if (controlError || !control) {
      console.error('[NativeSmsGateway] Platform control unavailable:', controlError?.message || 'Missing control row.');
      return NextResponse.json({ error: 'SMS gateway control is not configured.' }, { status: 503 });
    }

    if (control.enabled !== true) {
      return NextResponse.json({ job: null, gatewayPaused: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('store_name, sms_tracking_enabled')
      .eq('id', device.merchant_id)
      .maybeSingle();

    if (merchantError || !merchant) {
      console.error('[NativeSmsGateway] Merchant lookup failed:', merchantError?.message || 'Merchant missing.');
      return NextResponse.json({ error: 'The connected store is unavailable.' }, { status: 503 });
    }

    if (merchant.sms_tracking_enabled !== true) {
      return NextResponse.json({ job: null, merchantDisabled: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data, error } = await supabase.rpc('claim_next_sms_tracking_job_for_device', {
      p_device_id: device.device_id,
      p_merchant_id: device.merchant_id,
      p_lease_seconds: 180,
    });

    if (error) {
      console.error('[NativeSmsGateway] Could not claim a merchant SMS job:', error.message);
      return NextResponse.json({ error: 'Could not check for new order messages.' }, { status: 503 });
    }

    const job = Array.isArray(data) ? data[0] : data;
    if (!job) {
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await supabase
      .from('sms_gateway_devices')
      .update({ last_claim_at: now, updated_at: now })
      .eq('device_id', device.device_id)
      .eq('merchant_id', device.merchant_id);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, merchant_id, customer_phone, tracking_uuid')
      .eq('id', job.order_id)
      .eq('merchant_id', device.merchant_id)
      .maybeSingle();

    if (orderError) {
      console.error('[NativeSmsGateway] Claimed order lookup failed:', orderError.message);
      await releaseClaimedJobForRetry(supabase, job.id, device.device_id, orderError.message);
      return NextResponse.json({ error: 'Could not read the new order.' }, { status: 503 });
    }

    if (!order?.tracking_uuid) {
      await skipJob(supabase, job.id, device.device_id, 'order_or_tracking_link_missing');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const phone = normalizeAlgerianMobilePhone(order.customer_phone);
    if (!phone) {
      await skipJob(supabase, job.id, device.device_id, 'invalid_algerian_mobile_number');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const baseUrl = (
      process.env.TRACKING_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://tajertrack.vercel.app'
    ).replace(/\/+$/, '');
    const trackingUrl = `${baseUrl}/t/${encodeURIComponent(order.tracking_uuid)}`;
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
    console.error('[NativeSmsGateway] Claim endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not check for new order messages.' }, { status: 500 });
  }
}
