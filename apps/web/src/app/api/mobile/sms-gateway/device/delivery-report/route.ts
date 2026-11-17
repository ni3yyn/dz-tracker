import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_STATES = new Set(['delivered', 'failed', 'unknown']);

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const claimToken = typeof body?.claimToken === 'string' ? body.claimToken : '';
  const deliveryStatus = typeof body?.deliveryStatus === 'string'
    ? body.deliveryStatus
    : '';
  const rawStatusCode = body?.statusCode;
  const statusCode = Number.isInteger(rawStatusCode) && rawStatusCode >= 0 && rawStatusCode <= 0x7fffffff
    ? rawStatusCode
    : null;
  const rawReportedAt = Number(body?.reportedAt);
  const now = new Date();
  const reportedAt = Number.isFinite(rawReportedAt) &&
    rawReportedAt > Date.UTC(2020, 0, 1) &&
    rawReportedAt <= now.getTime() + 5 * 60_000
      ? new Date(rawReportedAt).toISOString()
      : now.toISOString();

  if (!UUID_RE.test(jobId) || !UUID_RE.test(claimToken) || !DELIVERY_STATES.has(deliveryStatus)) {
    return NextResponse.json({ error: 'Invalid SMS delivery report.' }, { status: 400 });
  }

  try {
    // A per-message, one-time claim token is the callback capability. It cannot
    // list jobs or read customer data; it can only report this exact SMS job.
    const supabase = createSupabaseAdminClient();
    const { data: job, error: readError } = await supabase
      .from('sms_tracking_outbox')
      .select('id, status, delivery_status, claim_token, last_claim_token, last_device_id')
      .eq('id', jobId)
      .maybeSingle();

    if (readError) {
      console.error('[NativeSmsGateway] Delivery report lookup failed:', readError.message);
      return NextResponse.json({ error: 'Could not verify this delivery report.' }, { status: 503 });
    }
    if (!job || (job.claim_token !== claimToken && job.last_claim_token !== claimToken)) {
      return NextResponse.json({ error: 'This delivery report is not valid for the SMS job.' }, { status: 404 });
    }
    if (!['processing', 'submitted', 'unknown'].includes(job.status)) {
      return NextResponse.json({ error: 'The SMS job is no longer eligible for a delivery report.' }, { status: 409 });
    }

    const current = String(job.delivery_status || 'not_requested');
    if (current === 'delivered') {
      return NextResponse.json({ success: true, deliveryStatus: 'delivered', alreadyRecorded: true });
    }
    if (current === 'failed' && deliveryStatus !== 'delivered') {
      return NextResponse.json({ success: true, deliveryStatus: 'failed', alreadyRecorded: true });
    }
    if (deliveryStatus === 'unknown' && current !== 'pending' && current !== 'unknown') {
      return NextResponse.json({ success: true, deliveryStatus: current, ignored: true });
    }

    const update = {
      delivery_status: deliveryStatus,
      delivery_status_code: statusCode,
      delivery_reported_at: reportedAt,
      delivered_at: deliveryStatus === 'delivered' ? reportedAt : null,
      delivery_error: deliveryStatus === 'failed'
        ? `The carrier reported a permanent delivery failure (status ${statusCode ?? 'unknown'}).`
        : deliveryStatus === 'unknown'
          ? 'The carrier returned a status report that does not confirm delivery.'
          : null,
      updated_at: now.toISOString(),
    };

    const { data: updated, error: updateError } = await supabase
      .from('sms_tracking_outbox')
      .update(update)
      .eq('id', jobId)
      .eq('last_claim_token', claimToken)
      .in('status', ['processing', 'submitted', 'unknown'])
      .neq('delivery_status', 'delivered')
      .select('id, delivery_status')
      .maybeSingle();

    if (updateError) {
      console.error('[NativeSmsGateway] Delivery report save failed:', updateError.message);
      return NextResponse.json({ error: 'Could not save the delivery report.' }, { status: 503 });
    }
    if (!updated) {
      // Concurrent duplicate reports are harmless; a positive receipt remains
      // authoritative and the callback is idempotent.
      const { data: latest } = await supabase
        .from('sms_tracking_outbox')
        .select('delivery_status')
        .eq('id', jobId)
        .maybeSingle();
      if (latest?.delivery_status === 'delivered') {
        return NextResponse.json({ success: true, deliveryStatus: 'delivered', alreadyRecorded: true });
      }
      return NextResponse.json({ error: 'The delivery report could not be applied to this SMS job.' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      deliveryStatus: updated.delivery_status,
      reportedAt,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('[NativeSmsGateway] Delivery report endpoint failed:', error?.message || error);
    return NextResponse.json({ error: 'Could not save the delivery report.' }, { status: 500 });
  }
}
