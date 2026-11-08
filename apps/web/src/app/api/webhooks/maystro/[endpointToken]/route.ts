import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { MaystroAdapter, parseMaystroWebhookEnvelope } from '@saas/orchestrator';
import { TrackingOrchestrator } from '@saas/orchestrator';
import { decryptMaystroCredentials } from '../../../../../lib/maystro-credentials';
import { enqueueOrderConfirmationForNewOrder } from '../../../../../lib/order-confirmation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ endpointToken: string }>;
};

const MAYSTRO_ORDER_API = 'https://backend.maystro-delivery.com';
const MAYSTRO_HISTORY_API = 'https://b.maystro-delivery.com';
const MAX_BODY_BYTES = 1_000_000;
const RELEVANT_EVENTS = new Set([
  'DeliveryInfoUpdated',
  'OrderFieldUpdated',
  'OrderDelivered',
  'OrderStatusChanged',
]);

class MaystroRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'MaystroRequestError';
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function maystroGet(url: string, apiToken: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${apiToken}`,
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new MaystroRequestError('Could not reach Maystro API.');
  }

  const text = await response.text().catch(() => '');
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new MaystroRequestError('Maystro API returned invalid JSON.', response.status);
    }
  }

  if (!response.ok) {
    throw new MaystroRequestError(
      `Maystro API request failed with HTTP ${response.status}.`,
      response.status
    );
  }
  return body;
}

function unwrapOrder(body: unknown): Record<string, any> {
  let value: any = body;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.order && typeof value.order === 'object') value = value.order;
    else if (value.data && typeof value.data === 'object' && !Array.isArray(value.data)) value = value.data;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.id) {
    throw new MaystroRequestError('Maystro order response did not contain an order UUID.');
  }
  return value as Record<string, any>;
}

async function fetchMaystroOrder(reference: string, apiToken: string): Promise<Record<string, any>> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(reference)) {
    const body = await maystroGet(
      `${MAYSTRO_ORDER_API}/api/stores/orders/${encodeURIComponent(reference)}/`,
      apiToken
    );
    return unwrapOrder(body);
  }

  // Maystro also lets us resolve the numeric display_id / tracking number.
  const url = new URL('/api/stores/orders/', MAYSTRO_ORDER_API);
  url.searchParams.set('display_id', reference);
  const body: any = await maystroGet(url.toString(), apiToken);
  const page = body?.list && typeof body.list === 'object' ? body.list : body;
  const rows = Array.isArray(page) ? page : Array.isArray(page?.results) ? page.results : [];
  const match = rows.find((row: any) =>
    row && String(row.display_id ?? row.tracking ?? '') === reference && row.id
  );
  if (!match) throw new MaystroRequestError('Maystro order was not found.', 404);
  return match;
}

async function fetchMaystroHistory(orderId: string, apiToken: string): Promise<unknown> {
  const url = `${MAYSTRO_HISTORY_API}/api/stores/history_order/${encodeURIComponent(orderId)}`;
  const body: any = await maystroGet(url, apiToken);
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray(body.results)) return body.results;
  throw new MaystroRequestError('Maystro order history response has an unexpected format.');
}

async function setWebhookReceipt(
  supabase: any,
  integrationId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('merchant_carrier_integrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', integrationId);
  if (error) throw new Error('Could not update Maystro webhook connection state.');
}

export async function POST(req: Request, context: RouteContext) {
  const { endpointToken } = await context.params;

  // 256-bit random URL secret; Maystro does not sign its outgoing webhooks.
  if (!/^[a-f0-9]{64}$/i.test(endpointToken)) {
    return jsonResponse({ error: 'Unknown webhook endpoint.' }, 404);
  }

  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Webhook payload is too large.' }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: 'Could not read webhook body.' }, 400);
  }
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'Webhook body is empty or too large.' }, 400);
  }

  let event;
  try {
    event = parseMaystroWebhookEnvelope(rawBody);
  } catch (error: any) {
    console.warn('[MaystroWebhook] Rejected malformed event:', error?.message || 'invalid envelope');
    return jsonResponse({ error: 'Invalid Maystro webhook envelope.' }, 400);
  }

  const supabase = getSupabaseAdminClient();
  const { data: integration, error: integrationError } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .select('id, merchant_id, credentials_encrypted')
    .eq('provider', 'maystro')
    .eq('webhook_endpoint_token', endpointToken)
    .eq('sync_enabled', true)
    .maybeSingle();

  if (integrationError) {
    console.error('[MaystroWebhook] Integration lookup failed:', integrationError.message);
    return jsonResponse({ error: 'Webhook receiver is temporarily unavailable.' }, 500);
  }
  if (!integration) {
    return jsonResponse({ error: 'Unknown or disconnected webhook endpoint.' }, 404);
  }

  let apiToken: string;
  try {
    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    apiToken = decryptMaystroCredentials(
      integration.credentials_encrypted,
      integration.merchant_id,
      encryptionKey
    ).apiToken;
  } catch (error: any) {
    console.error('[MaystroWebhook] Could not decrypt merchant credentials:', error?.message || 'decrypt failed');
    return jsonResponse({ error: 'Maystro connection credentials are unavailable.' }, 500);
  }

  const receivedAt = new Date().toISOString();
  try {
    await setWebhookReceipt(supabase, integration.id, {
      last_webhook_received_at: receivedAt,
      last_error: null,
      last_error_at: null,
    });
  } catch (error: any) {
    console.error('[MaystroWebhook] Could not record receipt:', error?.message || 'database update failed');
    return jsonResponse({ error: 'Could not record webhook receipt.' }, 500);
  }

  if (event.isTest || (!event.eventType && !event.orderId)) {
    try {
      await setWebhookReceipt(supabase, integration.id, {
        last_webhook_processed_at: new Date().toISOString(),
      });
    } catch {
      return jsonResponse({ error: 'Could not record the Maystro test event.' }, 500);
    }
    return jsonResponse({ success: true, test: true, message: 'Maystro test webhook received.' });
  }

  if (!RELEVANT_EVENTS.has(event.eventType)) {
    // DeliveryInfoUpdated refreshes the order snapshot and history. It normally
    // creates no new timeline row, but keeps address and pricing metadata current.
    return jsonResponse({
      success: true,
      ignored: true,
      event: event.eventType || 'unknown',
    });
  }

  if (!event.orderId) {
    return jsonResponse({ error: 'Maystro order event did not contain an order identifier.' }, 400);
  }

  try {
    const order = await fetchMaystroOrder(event.orderId, apiToken);
    const history = await fetchMaystroHistory(String(order.id), apiToken);
    const events = MaystroAdapter.normalizeOrderHistory(
      integration.merchant_id,
      order,
      history,
      event.eventType
    );

    if (!events.length) {
      throw new MaystroRequestError('Maystro returned no usable order history.');
    }

    const orchestrator = new TrackingOrchestrator();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app';

    // The adapter sorts provider history from oldest to newest. Each row gets
    // its own stable event key, so retries are idempotent and late older events
    // can be added to the timeline without rolling back the current status.
    for (let index = 0; index < events.length; index += 1) {
      const historyEvent = events[index];
      // Backfill every historical step, but only the latest state should fan
      // out customer notifications. Otherwise a first-time import of a long
      // history would send one push/message per old status.
      const trackingEvent = index < events.length - 1
        ? { ...historyEvent, suppressTriggers: true }
        : historyEvent;
      const result = await orchestrator.processEvent(trackingEvent, { siteUrl });
      if (!result.success) {
        throw new MaystroRequestError(
          `TajerTrack could not apply Maystro history event: ${String(result.error || 'unknown error')}`
        );
      }

      if (result.isNewOrder && result.orderId) {
        try {
          await enqueueOrderConfirmationForNewOrder({
            merchantId: integration.merchant_id,
            orderId: result.orderId,
            customerPhone: trackingEvent.customerPhone,
          });
        } catch (error: any) {
          // Confirmation delivery is independent from carrier status ingestion.
          console.warn('[MaystroWebhook] Could not enqueue order confirmation:', error?.message || 'enqueue failed');
        }
      }
    }

    await setWebhookReceipt(supabase, integration.id, {
      last_webhook_processed_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
    });

    return jsonResponse({
      success: true,
      event: event.eventType,
      orderImported: true,
      historyEventsRead: events.length,
    });
  } catch (error: any) {
    const message = String(error?.message || 'Maystro webhook processing failed').slice(0, 400);
    console.error('[MaystroWebhook] Processing failed:', {
      merchantId: integration.merchant_id,
      event: event.eventType,
      status: error instanceof MaystroRequestError ? error.status : undefined,
      message,
    });

    await setWebhookReceipt(supabase, integration.id, {
      last_error: message,
      last_error_at: new Date().toISOString(),
    }).catch(() => undefined);

    // Non-2xx lets Maystro retry if its webhook service supports retry delivery.
    return jsonResponse({ error: 'Maystro shipment could not be synchronized. Please retry.' }, 502);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
