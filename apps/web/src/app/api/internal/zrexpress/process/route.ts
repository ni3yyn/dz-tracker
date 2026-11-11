import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { TrackingOrchestrator, ZRExpressWebhookAdapter, isZRExpressWebhookEvent } from '@saas/orchestrator';
import { enqueueOrderConfirmationForNewOrder } from '../../../../../lib/order-confirmation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function deriveWorkerSigningKey(rootKey: string): Buffer {
  if (!rootKey || rootKey.length < 32) {
    throw new Error('CARRIER_CREDENTIALS_ENCRYPTION_KEY is not configured.');
  }
  return createHmac('sha256', rootKey)
    .update('tajertrack:zrexpress:worker-request:v1', 'utf8')
    .digest();
}

function verifyWorkerRequest(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300) {
    return false;
  }

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
    req.headers.get('x-zrexpress-worker-timestamp'),
    req.headers.get('x-zrexpress-worker-signature')
  )) {
    return NextResponse.json({ error: 'Unauthorized internal worker request.' }, { status: 401 });
  }

  let request: { eventId?: unknown; workerId?: unknown };
  try {
    request = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed internal request.' }, { status: 400 });
  }

  const eventId = typeof request.eventId === 'string' ? request.eventId : '';
  const workerId = typeof request.workerId === 'string' ? request.workerId : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) ||
    !/^zr-webhook-[0-9a-f-]{36}$/i.test(workerId)
  ) {
    return NextResponse.json({ error: 'Invalid internal event reference.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: job, error: jobError } = await (supabase as any)
    .from('zrexpress_webhook_events')
    .select('id, merchant_id, svix_id, event_type, occurred_at, payload, status, locked_by, lease_expires_at')
    .eq('id', eventId)
    .maybeSingle();

  if (jobError) {
    console.error('[ZRExpressProcessor]: Queue lookup failed:', jobError.message);
    return NextResponse.json({ error: 'Could not load queued ZR Express event.' }, { status: 500 });
  }
  if (
    !job ||
    job.status !== 'processing' ||
    job.locked_by !== workerId ||
    !job.lease_expires_at ||
    new Date(job.lease_expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.json({ error: 'The ZR Express event lease is no longer owned by this worker.' }, { status: 409 });
  }

  try {
    const payload: unknown = job.payload;
    if (
      !isZRExpressWebhookEvent(payload) ||
      payload.eventType !== job.event_type ||
      Date.parse(payload.occurredAt) !== Date.parse(job.occurred_at)
    ) {
      throw new Error('Queued ZR Express event envelope is inconsistent.');
    }

    const event = ZRExpressWebhookAdapter.normalize(job.merchant_id, payload, job.svix_id);
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
        error: errorCode || result.message || 'TajerTrack could not process the ZR Express event.',
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
        // Confirmation is independent from the carrier timeline and must not
        // turn a successful status update into a retried event.
        console.warn('[ZRExpressProcessor]: Confirmation enqueue failed:', error?.message || error);
      }
    }

    return NextResponse.json({
      success: true,
      isNewOrder: Boolean(result.isNewOrder),
      deduplicated: Boolean(result.deduplicated),
      status: event.statusRaw,
    });
  } catch (error: any) {
    console.error('[ZRExpressProcessor]: Event processing failed:', error?.message || error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'ZR Express event processing failed.',
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
