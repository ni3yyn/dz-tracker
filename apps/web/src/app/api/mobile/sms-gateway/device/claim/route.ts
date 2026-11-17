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

function operatorForPhone(phone: string): string | null {
  const match = phone.match(/^\+213([5-7])\d{8}$/);
  if (!match) return null;
  return match[1] === '5' ? 'ooredoo' : match[1] === '6' ? 'mobilis' : 'djezzy';
}

async function skipJob(
  supabase: any,
  jobId: string,
  deviceId: string,
  claimToken: string,
  reason: string
) {
  await supabase
    .from('sms_tracking_outbox')
    .update({
      status: 'skipped',
      result_code: reason,
      last_error: reason,
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      claim_token: null,
      dispatch_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .eq('locked_by', deviceId)
    .eq('claim_token', claimToken);
}

async function releaseClaimedJobForRetry(
  supabase: any,
  jobId: string,
  deviceId: string,
  claimToken: string,
  reason: string
) {
  await supabase
    .from('sms_tracking_outbox')
    .update({
      status: 'retry',
      available_at: new Date(Date.now() + 30_000).toISOString(),
      result_code: 'pre_dispatch_backend_error',
      last_error: reason.slice(0, 500),
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      claim_token: null,
      dispatch_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .eq('locked_by', deviceId)
    .eq('claim_token', claimToken);
}

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const tokenHash = hashNativeSmsCredential(token);
  const appVersion = typeof body?.appVersion === 'string' ? body.appVersion.slice(0, 32) : null;
  const operatorCode = typeof body?.operatorCode === 'string'
    ? body.operatorCode.trim().toLowerCase()
    : null;
  const dispatchProtocol = body?.dispatchProtocol === 1 || body?.dispatchProtocol === true;

  if (operatorCode && !['djezzy', 'mobilis', 'ooredoo'].includes(operatorCode)) {
    return NextResponse.json({ error: 'Invalid SIM carrier.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as any;

    // A legacy single-SIM pairing has no carrier label. Resolve it from the
    // phone's explicitly selected primary SIM and permanently bind that line
    // before it can claim carrier-specific customer jobs.
    if (operatorCode) {
      const { data: assigned, error: assignError } = await supabase.rpc(
        'assign_native_sms_gateway_legacy_operator',
        { p_token_hash: tokenHash, p_operator_code: operatorCode }
      );
      if (assignError) {
        console.error('[NativeSmsGateway] Could not classify the legacy sender line:', assignError.message);
        return NextResponse.json({ error: 'تعذر تحديد شبكة شريحة الإرسال حالياً.' }, { status: 503 });
      }
      if (assigned === false) {
        return NextResponse.json({
          job: null,
          operatorConflict: true,
          error: 'هذا الهاتف لم يُربط بهذه الشبكة. قد يكون مرتبطاً بشبكة أخرى أو يوجد خط نشط للشبكة نفسها.',
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }

    // New clients use a claim/dispatch handshake. Older installed versions
    // omit dispatchProtocol; the database conservatively treats their claim
    // as potentially sent so a crash cannot cause a duplicate SMS.
    const { data: poll, error: pollError } = await supabase.rpc('poll_native_sms_gateway', {
      p_token_hash: tokenHash,
      p_app_version: appVersion,
      p_lease_seconds: 300,
      p_dispatch_protocol: dispatchProtocol,
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
    if (poll?.operatorUnassigned === true) {
      return NextResponse.json({
        job: null,
        operatorUnassigned: true,
      }, { headers: { 'Cache-Control': 'no-store' } });
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
    const claimToken = typeof job.claim_token === 'string' ? job.claim_token : '';
    if (!deviceId || !merchantId || typeof job.id !== 'string' ||
        typeof job.order_id !== 'string' || !claimToken) {
      console.error('[NativeSmsGateway] Poll RPC returned an incomplete claimed job.');
      return NextResponse.json({ error: 'The claimed message could not be prepared.' }, { status: 503 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, merchant_id, customer_phone, tracking_uuid, created_at')
      .eq('id', job.order_id)
      .eq('merchant_id', merchantId)
      .maybeSingle();

    if (orderError) {
      console.error('[NativeSmsGateway] Claimed order lookup failed:', orderError.message);
      await releaseClaimedJobForRetry(supabase, job.id, deviceId, claimToken, orderError.message);
      return NextResponse.json({ error: 'Could not read the new order.' }, { status: 503 });
    }

    if (!order?.tracking_uuid) {
      // Order creation can commit before a tracking UUID is attached by a
      // follow-up transaction. Do not discard a valid order during that race.
      await releaseClaimedJobForRetry(
        supabase,
        job.id,
        deviceId,
        claimToken,
        'The order does not have a tracking UUID yet. The SMS remains queued for another check.'
      );
      return NextResponse.json({ job: null, deferred: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const phone = normalizeAlgerianMobilePhone(order.customer_phone);
    if (!phone) {
      await skipJob(supabase, job.id, deviceId, claimToken, 'invalid_algerian_mobile_number');
      return NextResponse.json({ job: null }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const actualOperator = operatorForPhone(phone);
    if (!actualOperator || actualOperator !== job.recipient_operator || actualOperator !== poll.operatorCode) {
      // Never send a corrected number through the wrong carrier's SIM. The
      // order-update trigger will recalculate the route when the phone changes.
      await skipJob(supabase, job.id, deviceId, claimToken, 'recipient_carrier_mismatch');
      console.error('[NativeSmsGateway] Refused a sender/recipient carrier mismatch for order:', order.id);
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
        claimToken,
        phone,
        message,
        attemptCount: job.attempt_count,
        expiresAt: job.expires_at,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Claim endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not check for new order messages.' }, { status: 500 });
  }
}
