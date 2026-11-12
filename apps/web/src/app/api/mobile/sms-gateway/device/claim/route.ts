import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { hashNativeSmsCredential } from '../../../../../../lib/native-sms-gateway-auth';

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

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim() || '';
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const tokenHash = hashNativeSmsCredential(token);
  const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.slice(0, 32) : null;

  try {
    const supabase = getSupabaseAdminClient() as any;

    // One database round-trip handles device authentication, heartbeat,
    // platform/merchant switches and tenant-scoped job claiming.
    const { data: poll, error: pollError } = await supabase.rpc('poll_native_sms_gateway', {
      p_token_hash: tokenHash,
      p_app_version: appVersion,
      p_lease_seconds: 180,
    });

    if (pollError) {
      console.error('[NativeSmsGateway] Device poll failed:', pollError.message);
      return NextResponse.json({ error: 'Could not check for new order messages.' }, { status: 503 });
    }

    if (poll?.errorCode === 'unauthorized') {
      return NextResponse.json({ error: 'This phone is no longer connected. Reconnect it from TajerTrack.' }, { status: 401 });
    }
    if (poll?.errorCode === 'gateway_control_unavailable') {
      return NextResponse.json({ error: 'SMS gateway control is not configured.' }, { status: 503 });
    }
    if (poll?.deviceDisabled === true) {
      return NextResponse.json({ job: null, deviceDisabled: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (poll?.gatewayPaused === true) {
      return NextResponse.json({ job: null, gatewayPaused: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (poll?.merchantDisabled === true || !poll?.job) {
      return NextResponse.json({
        job: null,
        merchantDisabled: poll?.merchantDisabled === true,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const job = poll.job;
    const deviceId = typeof poll.deviceId === 'string' ? poll.deviceId : '';
    const merchantId = typeof poll.merchantId === 'string' ? poll.merchantId : '';
    if (!deviceId || !merchantId || typeof job.id !== 'string' || typeof job.order_id !== 'string') {
      console.error('[NativeSmsGateway] Poll RPC returned an incomplete claimed job.');
      return NextResponse.json({ error: 'The claimed message could not be prepared.' }, { status: 503 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, merchant_id, customer_phone, tracking_uuid')
      .eq('id', job.order_id)
      .eq('merchant_id', merchantId)
      .maybeSingle();

    if (orderError) {
      console.error('[NativeSmsGateway] Claimed order lookup failed:', orderError.message);
      await releaseClaimedJobForRetry(supabase, job.id, deviceId, orderError.message);
      return NextResponse.json({ error: 'Could not read the new order.' }, { status: 503 });
    }

    if (!order?.tracking_uuid) {
      await skipJob(supabase, job.id, deviceId, 'order_or_tracking_link_missing');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const phone = normalizeAlgerianMobilePhone(order.customer_phone);
    if (!phone) {
      await skipJob(supabase, job.id, deviceId, 'invalid_algerian_mobile_number');
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
