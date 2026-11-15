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

function isRedactedValue(value: unknown): boolean {
  return typeof value === 'string' && /\*/.test(value);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function enqueueTrackingLinkNotifications(
  supabase: any,
  merchantId: string,
  trackingNumber: string
): Promise<unknown> {
  const { data: order, error: lookupError } = await supabase
    .from('orders')
    .select('id')
    .eq('merchant_id', merchantId)
    .eq('carrier_tracking_number', trackingNumber)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Could not resolve the Yalidine-linked TajerTrack order: ${lookupError.message}`);
  }
  if (!order?.id) {
    throw new Error('The Yalidine parcel was processed but its TajerTrack order could not be found by tracking number.');
  }

  const { data, error } = await supabase.rpc('enqueue_yalidine_tracking_notifications', {
    p_merchant_id: merchantId,
    p_order_id: order.id,
  });
  if (error) {
    throw new Error(`Could not enqueue Yalidine tracking notifications: ${error.message}`);
  }
  return data;
}

async function processYalidineParcelEdit(
  supabase: any,
  merchantId: string,
  data: Record<string, unknown>,
  apiEnriched = false
): Promise<Record<string, unknown>> {
  const normalized = YalidineAdapter.normalize(merchantId, data);
  const trackingNumber = normalized.carrierTrackingNumber;
  if (!trackingNumber) {
    return { success: true, ignored: true, reason: 'parcel_edit_without_tracking' };
  }

  const selectedFields = 'id, external_order_id, carrier_name, carrier_tracking_number, customer_name, customer_phone, product_name, carrier_metadata';
  const { data: trackedOrder, error: trackingLookupError } = await supabase
    .from('orders')
    .select(selectedFields)
    .eq('merchant_id', merchantId)
    .eq('carrier_tracking_number', trackingNumber)
    .limit(1)
    .maybeSingle();

  if (trackingLookupError) {
    throw new Error(\`Could not find the TajerTrack order for Yalidine tracking number: \${trackingLookupError.message}\`);
  }

  let referenceMatches: any[] = [];
  if (
    normalized.externalOrderId &&
    normalized.externalOrderId.toLowerCase() !== trackingNumber.toLowerCase()
  ) {
    const reference = normalized.externalOrderId.trim();
    const { data: matches, error: referenceError } = await supabase
      .from('orders')
      .select(selectedFields)
      .eq('merchant_id', merchantId)
      .ilike('external_order_id', escapeLikePattern(reference))
      .limit(20);
    if (referenceError) {
      throw new Error(\`Could not match the original TajerTrack order reference: \${referenceError.message}\`);
    }
    referenceMatches = (matches || []).filter((candidate: any) =>
      !candidate.carrier_name ||
      ['Yalidine Express', 'Guepex', 'Yalidine'].includes(candidate.carrier_name)
    );
  }

  const identityScore = (candidate: any) =>
    (candidate.customer_phone && !isRedactedValue(candidate.customer_phone) ? 2 : 0) +
    (candidate.customer_name && !isRedactedValue(candidate.customer_name) ? 1 : 0);
  const chooseUniqueBest = (candidates: any[]): any | null => {
    if (candidates.length === 1) return candidates[0];
    if (!candidates.length) return null;
    const scored = candidates.map((candidate) => ({ candidate, score: identityScore(candidate) }));
    const highest = Math.max(...scored.map((item) => item.score));
    const best = scored.filter((item) => item.score === highest);
    return highest > 0 && best.length === 1 ? best[0].candidate : null;
  };

  // Prefer the row already linked to this tracking number as the shipment
  // record. If an earlier sync created a sparse duplicate, recover the real
  // customer identity from the unique original order with the same order_id.
  let order = trackedOrder;
  let identitySource: any | null = null;
  if (order) {
    identitySource = chooseUniqueBest(referenceMatches.filter((candidate) => candidate.id !== order.id));
  } else {
    order = chooseUniqueBest(referenceMatches);
    identitySource = order;
    if (referenceMatches.length > 1 && !order) {
      throw new Error('The Yalidine order reference matches multiple TajerTrack orders without a unique customer identity; refusing an ambiguous automatic merge.');
    }
  }

  if (!order) {
    // Never create a second order from an edit or API-enrichment event.
    return { success: true, ignored: true, reason: 'parcel_not_linked_yet', linkedOrder: false };
  }

  if (
    order.carrier_name &&
    !['Yalidine Express', 'Guepex', 'Yalidine'].includes(order.carrier_name)
  ) {
    return {
      success: true,
      ignored: true,
      reason: 'order_linked_to_another_carrier',
      linkedOrder: false,
    };
  }

  const updates: Record<string, unknown> = {};
  const sourceName = identitySource?.customer_name && !isRedactedValue(identitySource.customer_name)
    ? identitySource.customer_name
    : normalized.customerName && !isRedactedValue(normalized.customerName)
      ? normalized.customerName
      : undefined;
  const sourcePhone = identitySource?.customer_phone && !isRedactedValue(identitySource.customer_phone)
    ? identitySource.customer_phone
    : normalized.customerPhone;

  if (
    sourceName &&
    (!order.customer_name || isRedactedValue(order.customer_name))
  ) {
    updates.customer_name = sourceName;
  }
  if (sourcePhone && (!order.customer_phone || isRedactedValue(order.customer_phone))) {
    updates.customer_phone = sourcePhone;
  }
  if (normalized.productName && !String(order.product_name || '').trim()) {
    updates.product_name = normalized.productName;
  }
  if (!order.carrier_tracking_number) {
    updates.carrier_tracking_number = trackingNumber;
  }
  if (!order.carrier_name) {
    updates.carrier_name = 'Yalidine Express';
  }

  const existingMetadata = order.carrier_metadata && typeof order.carrier_metadata === 'object' && !Array.isArray(order.carrier_metadata)
    ? order.carrier_metadata
    : {};
  const incomingMetadata = normalized.carrierMetadata || {};
  if (Object.keys(incomingMetadata).length > 0 || apiEnriched) {
    updates.carrier_metadata = {
      ...existingMetadata,
      ...incomingMetadata,
      ...(apiEnriched ? {
        yalidine_api_details_checked_at: new Date().toISOString(),
        yalidine_api_details_result: 'found',
        yalidine_api_details_version: 2,
      } : {}),
    };
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('merchant_id', merchantId);
    if (updateError) {
      throw new Error(\`Could not apply details from Yalidine parcel to existing order: \${updateError.message}\`);
    }
  }

  // The notification RPC is idempotent; it recovers missed tracking-link jobs
  // without resending messages that were already sent or have an ambiguous outcome.
  const notifications = await enqueueTrackingLinkNotifications(supabase, merchantId, trackingNumber);
  return {
    success: true,
    edited: true,
    linkedOrder: true,
    orderId: order.id,
    identityRecoveredFromOriginalOrder: Boolean(identitySource && identitySource.id !== order.id),
    notifications,
  };
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

    // Parcel edits can contain additional recipient fields. Apply them only
    // to an already-linked order; never create an order or change its status.
    if (job.event_type === 'parcel_edited') {
      try {
        const editResult = await processYalidineParcelEdit(
          supabase as any,
          job.merchant_id,
          payload.data as Record<string, unknown>,
          payload.data.__guepex_api_lookup === true
        );
        return NextResponse.json(editResult);
      } catch (error: any) {
        console.error('[YalidineProcessor]: Parcel edit enrichment failed:', error?.message || error);
        return NextResponse.json({
          success: false,
          retryable: true,
          error: error?.message || 'Yalidine parcel edit could not be applied.',
        }, { status: 500 });
      }
    }

    // Payment and deletion events are retained for auditability but do not
    // alter shipment status or customer tracking delivery.
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

    // A parcel_created webhook often refers to an order that already exists in
    // TajerTrack. Link and enrich that order by tracking/order reference instead
    // of asking the orchestrator to create another record.
    if (job.event_type === 'parcel_created') {
      const existingResult = await processYalidineParcelEdit(
        supabase as any,
        job.merchant_id,
        payload.data as Record<string, unknown>,
        payload.data.__guepex_api_lookup === true
      );
      if (existingResult.linkedOrder === true) {
        return NextResponse.json({
          success: true,
          isNewOrder: false,
          deduplicated: true,
          existingOrderEnriched: true,
          trackingNotifications: existingResult.notifications || null,
        });
      }
      if (existingResult.reason === 'order_linked_to_another_carrier') {
        return NextResponse.json({
          success: true,
          ignored: true,
          reason: 'order_linked_to_another_carrier',
        });
      }
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

      // Status events remain authoritative for shipment state, while the
      // parcel API lookup fills in any customer/product details first.
      if (payload.data.__guepex_api_lookup === true) {
        await processYalidineParcelEdit(
          supabase as any,
          job.merchant_id,
          payload.data as Record<string, unknown>,
          true
        );
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

    if (job.event_type === 'parcel_created' && payload.data.__guepex_api_lookup === true) {
      try {
        await processYalidineParcelEdit(
          supabase as any,
          job.merchant_id,
          payload.data as Record<string, unknown>,
          true
        );
      } catch (error: any) {
        console.warn('[YalidineProcessor]: Post-create API detail enrichment failed:', error?.message || error);
      }
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

    let trackingNotifications: unknown = null;
    if (
      ['parcel_created', 'parcel_edited', 'parcel_status_updated'].includes(job.event_type) &&
      event.carrierTrackingNumber
    ) {
      try {
        trackingNotifications = await enqueueTrackingLinkNotifications(
          supabase as any,
          job.merchant_id,
          event.carrierTrackingNumber
        );
      } catch (error: any) {
        console.error('[YalidineProcessor]: Tracking notification enqueue failed:', error?.message || error);
        return NextResponse.json({
          success: false,
          retryable: true,
          error: error?.message || 'Yalidine tracking notifications could not be queued.',
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      isNewOrder: Boolean(result.isNewOrder),
      deduplicated: Boolean(result.deduplicated),
      status: event.statusRaw,
      trackingNotifications,
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
