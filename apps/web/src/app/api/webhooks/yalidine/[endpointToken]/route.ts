import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { decryptYalidineWebhookCredentials } from '../../../../../lib/yalidine-webhook-credentials';
import {
  isYalidineWebhookEventType,
  parseYalidineOccurredAt,
  verifyYalidineWebhookSignature,
} from '../../../../../lib/yalidine-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ endpointToken: string }>;
};

async function findIntegration(endpointToken: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .select('id, merchant_id, credentials_encrypted, sync_enabled')
    .eq('provider', 'yalidine')
    .eq('webhook_endpoint_token', endpointToken)
    .maybeSingle();
  if (error) throw new Error('Yalidine webhook integration lookup failed.');
  return data;
}

function validEndpointToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

export async function GET(req: Request, context: RouteContext) {
  const { endpointToken } = await context.params;
  if (!validEndpointToken(endpointToken)) {
    return new Response('Unknown webhook endpoint.', { status: 404 });
  }

  const url = new URL(req.url);
  const subscribe = url.searchParams.get('subscribe');
  const crcToken = url.searchParams.get('crc_token');
  if (subscribe === null || crcToken === null) {
    return new Response('Missing subscribe/crc_token', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const integration = await findIntegration(endpointToken);
    if (!integration) return new Response('Unknown webhook endpoint.', { status: 404 });
    // Guepex/Yalidine expects the exact CRC token as the plain-text response.
    return new Response(crcToken, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Webhook validation is temporarily unavailable.', { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  const { endpointToken } = await context.params;
  if (!validEndpointToken(endpointToken)) {
    return NextResponse.json({ error: 'Unknown webhook endpoint.' }, { status: 404 });
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  }

  let rawBody = '';
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Could not read webhook body.' }, { status: 400 });
  }
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > 1_000_000) {
    return NextResponse.json({ error: 'Webhook body is empty or too large.' }, { status: 400 });
  }

  let integration: any;
  try {
    integration = await findIntegration(endpointToken);
  } catch (error: any) {
    console.error('[YalidineWebhook]: Integration lookup failed:', error?.message || error);
    return NextResponse.json({ error: 'Webhook receiver is temporarily unavailable.' }, { status: 500 });
  }
  if (!integration || integration.sync_enabled !== true) {
    return NextResponse.json({ error: 'Unknown or disconnected webhook endpoint.' }, { status: 404 });
  }

  let webhookSecret = '';
  try {
    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    webhookSecret = decryptYalidineWebhookCredentials(
      integration.credentials_encrypted,
      integration.merchant_id,
      encryptionKey
    ).webhookSecret;
  } catch (error: any) {
    console.error('[YalidineWebhook]: Could not load signing credentials:', error?.message || 'credential decryption failed');
    return NextResponse.json({ error: 'Webhook receiver could not load its signing configuration.' }, { status: 500 });
  }

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook signing key has not been configured yet.' }, { status: 503 });
  }

  if (!verifyYalidineWebhookSignature(rawBody, req.headers.get('x-yalidine-signature'), webhookSecret)) {
    console.warn('[YalidineWebhook]: Rejected unverified event delivery.');
    return NextResponse.json({ error: 'Invalid Yalidine webhook signature.' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed webhook JSON.' }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !isYalidineWebhookEventType(body.type) ||
    !Array.isArray(body.events) ||
    body.events.length === 0 ||
    body.events.length > 1000
  ) {
    return NextResponse.json({ error: 'Invalid Yalidine webhook event envelope.' }, { status: 400 });
  }

  const receivedAt = new Date().toISOString();
  const rows = [];
  for (const event of body.events) {
    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event) ||
      typeof event.event_id !== 'string' ||
      !event.event_id.trim() ||
      event.event_id.length > 255 ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    ) {
      return NextResponse.json({ error: 'Invalid event in Yalidine webhook batch.' }, { status: 400 });
    }
    const occurredAt = parseYalidineOccurredAt(event.occurred_at);
    if (!occurredAt) {
      return NextResponse.json({ error: 'Yalidine event has an invalid occurred_at timestamp.' }, { status: 400 });
    }
    rows.push({
      merchant_id: integration.merchant_id,
      event_id: event.event_id.trim(),
      event_type: body.type,
      occurred_at: occurredAt,
      payload: {
        type: body.type,
        event_id: event.event_id.trim(),
        occurred_at: occurredAt,
        data: event.data,
      },
      status: 'pending',
      available_at: receivedAt,
    });
  }

  const supabase = getSupabaseAdminClient();
  const { error: enqueueError } = await (supabase as any)
    .from('yalidine_webhook_events')
    .upsert(rows, {
      onConflict: 'merchant_id,event_id',
      ignoreDuplicates: true,
    });

  if (enqueueError) {
    console.error('[YalidineWebhook]: Verified event batch could not be queued:', enqueueError.message);
    return NextResponse.json({ error: 'Verified webhook could not be queued.' }, { status: 500 });
  }

  const { error: updateError } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .update({
      last_webhook_received_at: receivedAt,
      last_error: null,
      last_error_at: null,
      updated_at: receivedAt,
    })
    .eq('id', integration.id);
  if (updateError) {
    console.error('[YalidineWebhook]: Could not save receive timestamp:', updateError.message);
    return NextResponse.json({ error: 'Webhook was queued but connection state could not be updated.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    received: rows.length,
    type: body.type,
    message: 'Yalidine webhook events queued for processing.',
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
