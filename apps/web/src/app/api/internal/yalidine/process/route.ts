import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { TrackingOrchestrator, YalidineAdapter } from '@saas/orchestrator';
import { enqueueOrderConfirmationForNewOrder } from '../../../../../lib/order-confirmation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function deriveWorkerSigningKey(rootKey: string): Buffer {
  if (!rootKey || rootKey.length < 32) {
    throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is not configured.');
  }
  return createHmac('sha256', rootKey)
    .update('tajertrack:yalidine:worker-request:v1', 'utf8')
    .digest();
}

function verifyWorkerRequest(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300) return false;
  try {
    const key = deriveWorkerSigningKey(process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '');
    const expected = createHmac('sha256', key).update(`${timestamp}.${rawBody}`, 'utf8').digest();
    const supplied = Buffer.from(signature, 'base64');
    return supplied.length === expected.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => '');
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > 2048) {
    return NextResponse.json({ error: 'Invalid internal request body.' }, { status: 400 });
  }

  if (!verifyWorkerRequest(
    rawBody,
    req.headers.get('x-yalidine-worker-timestamp'),
    req.headers.get('x-yalidine-worker-signature')
  )) {
    return NextResponse.json({ error: 'Unauthorized internal worker request.' }, { status: 401 });
  }

  let request: { eventId?: unknown; workerId?: unknown };
  try { request = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: 'Malformed internal request.' }, { status: 400 });
  }

  const eventId = typeof request.eventId === 'string' ? request.eventId : '';
  const workerId = typeof request.workerId === 'string' ? request.workerId : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) ||
    !/^yl-webhook-[0-9a-f-]{36}$/i.test(workerId)
  ) {
    return NextResponse.json({ error: 'Invalid internal event reference.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: job, error: jobError } = await (supabase as any)
    .from('yalidine_webhook_events')
    .select('id, merchant_id, event_id, event_type, occurred_at, payload, status, locked_by, lease_expires_at')
    .eq('id', eventId)
    .maybeSingle();

  if (jobError) {
    console.error('[YalidineProcessor]: Queue lookup failed:', jobError.message);
    return NextResponse.json({ error: 'Could not load queued Yalidine event.' }, { status: 500 });
  }
  if (
    !job ||
    job.status !== 'processing' ||
    job.locked_by !== workerId ||
    !job.lease_expires_at ||
    new Date(job.lease_expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.json({ error: 'The Yalidine event lease is no longer owned by this worker.' }, { status: 409 });
  }

  try {
    const payload: any = job.payload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.type !== job.event_type ||
      payload.event_id !== job.event_id ||
      Date.parse(String(payload.occurred_at)) !== Date.parse(job.occurred_at) ||
      !payload.data ||
      typeof payload.data !== 'object' ||
      Array.isArray(payload.data)
    ) {
      throw new Error('Queued Yalidine event envelope is inconsistent.');
    }

    // These events are retained and acknowledged for auditability, but only
    // creation and status changes currently alter the TajerTrack timeline.
    if (job.event_type !== 'parcel_created' && job.event_type !== 'parcel_status_updated') {
      return NextResponse.json({ success: true, ignored: true, eventType: job.event_type });
    }

    const event = YalidineAdapter.normalizeWebhookEvent(job.merchant_id, {
      event_id: job.event_id,
      occurred_at: job.occurred_at,
      type: job.event_type,
      data: payload.data,
    });

    if (!event.carrierTrackingNumber) {
      return NextResponse.json({
        success: false,
        retryable: false,
        error: 'Yalidine event does not contain a tracking number.',
      }, { status: 422 });
    }
    if (job.event_type === 'parcel_status_updated' && !String(payload.data.status || '').trim()) {
      return NextResponse.json({
        success: false,
        retryable: false,
        error: 'Yalidine status event does not contain a status value.',
      }, { status: 422 });
    }

    // Status webhooks carry only the carrier tracking reference. If a status
    // arrives before its parcel_created event has been processed (possible
    // with concurrent queue workers), do not let the orchestrator create a
    // phantom order whose external_order_id is the tracking number. Retry
    // until the create event has safely registered the parcel.
    if (job.event_type === 'parcel_status_updated') {
      const { data: knownOrder, error: lookupError } = await (supabase as any)
        .from('orders')
        .select('id')
        .eq('merchant_id', job.merchant_id)
        .eq('carrier_tracking_number', event.carrierTrackingNumber)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        console.error('[YalidineProcessor]: Could not resolve status event tracking number:', lookupError.message);
        return NextResponse.json({
          success: false,
          retryable: true,
          error: 'Could not resolve the existing TajerTrack parcel before applying its status.',
        }, { status: 500 });
      }
      if (!knownOrder) {
        return NextResponse.json({
          success: false,
          retryable: true,
          error: 'Parcel has not been registered yet; retrying after its parcel_created event.',
        }, { status: 503 });
      }
    }

    const orchestrator = new TrackingOrchestrator();
    const result = await orchestrator.processEvent(event, {
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app',
    });

    if (!result.success) {
      const errorCode = typeof result.error === 'string' ? result.error : '';
      const permanent = [
        'merchant_not_found',
        'account_suspended',
        'subscription_expired',
        'subscription_limit_reached',
        'invalid_order_identity',
      ].includes(errorCode);
      return NextResponse.json({
        success: false,
        retryable: !permanent,
        error: errorCode || result.message || 'TajerTrack could not process the Yalidine event.',
      }, { status: permanent ? 422 : 500 });
    }

    if (result.isNewOrder && result.orderId) {
      try {
        await enqueueOrderConfirmationForNewOrder({
          merchantId: job.merchant_id,
          orderId: result.orderId,
          customerPhone: event.customerPhone,
        });
      } catch (error: any) {
        console.warn('[YalidineProcessor]: Confirmation enqueue failed:', error?.message || error);
      }
    }

    return NextResponse.json({
      success: true,
      isNewOrder: Boolean(result.isNewOrder),
      deduplicated: Boolean(result.deduplicated),
      status: event.statusRaw,
    });
  } catch (error: any) {
    console.error('[YalidineProcessor]: Event processing failed:', error?.message || error);
    return NextResponse.json({
      success: false,
      retryable: false,
      error: error?.message || 'Yalidine event could not be normalized.',
    }, { status: 422 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
