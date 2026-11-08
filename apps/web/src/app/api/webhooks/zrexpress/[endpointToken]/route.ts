import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';
import { verifyZRExpressWebhook } from '@saas/orchestrator';
import { decryptZRExpressCredentials } from '../../../../../lib/zrexpress-credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ endpointToken: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  const { endpointToken } = await context.params;

  // The URL token only locates a tenant-specific encrypted signing secret.
  // Authenticity still depends on Svix HMAC verification, never on this token.
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(endpointToken)) {
    return NextResponse.json({ error: 'Unknown webhook endpoint.' }, { status: 404 });
  }

  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (declaredLength > 1_000_000) {
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

  const supabase = getSupabaseAdminClient();
  const { data: integration, error: integrationError } = await (supabase as any)
    .from('merchant_carrier_integrations')
    .select('id, merchant_id, credentials_encrypted, webhook_endpoint_id')
    .eq('provider', 'zrexpress')
    .eq('webhook_endpoint_token', endpointToken)
    .eq('sync_enabled', true)
    .maybeSingle();

  if (integrationError) {
    console.error('[ZRExpressWebhook]: Integration lookup failed:', integrationError.message);
    return NextResponse.json({ error: 'Webhook receiver is temporarily unavailable.' }, { status: 500 });
  }
  if (!integration) {
    return NextResponse.json({ error: 'Unknown or disconnected webhook endpoint.' }, { status: 404 });
  }

  let signingSecret = '';
  try {
    const encryptionKey = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    const credentials = decryptZRExpressCredentials(
      integration.credentials_encrypted,
      integration.merchant_id,
      encryptionKey
    );
    signingSecret = credentials.signingSecret;
  } catch (error: any) {
    // Encryption/configuration failures are transient server errors: let Svix retry.
    console.error('[ZRExpressWebhook]: Could not load signing credentials:', error?.message || 'credential decryption failed');
    return NextResponse.json({ error: 'Webhook receiver could not load its signing configuration.' }, { status: 500 });
  }

  let verified: ReturnType<typeof verifyZRExpressWebhook>;
  try {
    verified = verifyZRExpressWebhook(signingSecret, rawBody, {
      'svix-id': req.headers.get('svix-id') || undefined,
      'svix-timestamp': req.headers.get('svix-timestamp') || undefined,
      'svix-signature': req.headers.get('svix-signature') || undefined,
    });
  } catch (error: any) {
    // A bad signature/timestamp is a permanent 4xx; payloads and secrets are
    // deliberately excluded from logs and the response.
    console.warn('[ZRExpressWebhook]: Rejected unverified delivery:', error?.message || 'verification failed');
    return NextResponse.json({ error: 'Invalid ZR Express webhook signature or payload.' }, { status: 401 });
  }

  const { error: enqueueError } = await (supabase as any)
    .from('zrexpress_webhook_events')
    .insert({
      merchant_id: integration.merchant_id,
      svix_id: verified.id,
      event_type: verified.event.eventType,
      occurred_at: verified.event.occurredAt,
      payload: verified.event,
      status: 'pending',
      available_at: new Date().toISOString(),
    });

  let deduplicated = false;
  let requeuedDeadLetter = false;
  if (enqueueError?.code === '23505') {
    deduplicated = true;
    // A provider replay keeps its original svix-id. Re-open only a dead-lettered
    // queue item; completed, pending, retrying and currently-processing rows
    // remain untouched. The applied-event ledger prevents duplicate timelines.
    const { data: existing, error: lookupError } = await (supabase as any)
      .from('zrexpress_webhook_events')
      .select('id, status')
      .eq('merchant_id', integration.merchant_id)
      .eq('svix_id', verified.id)
      .maybeSingle();

    if (lookupError) {
      console.error('[ZRExpressWebhook]: Could not inspect duplicate delivery:', lookupError.message);
      return NextResponse.json({ error: 'Could not inspect existing webhook delivery.' }, { status: 500 });
    }

    if (existing?.status === 'dead_letter') {
      const now = new Date().toISOString();
      const { error: requeueError } = await (supabase as any)
        .from('zrexpress_webhook_events')
        .update({
          status: 'pending',
          attempt_count: 0,
          available_at: now,
          last_error: null,
          locked_by: null,
          locked_at: null,
          lease_expires_at: null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .eq('status', 'dead_letter');

      if (requeueError) {
        console.error('[ZRExpressWebhook]: Could not requeue dead-lettered delivery:', requeueError.message);
        return NextResponse.json({ error: 'Could not requeue existing webhook delivery.' }, { status: 500 });
      }
      requeuedDeadLetter = true;
    }
  } else if (enqueueError) {
    console.error('[ZRExpressWebhook]: Verified event could not be queued:', enqueueError.message);
    return NextResponse.json({ error: 'Verified event could not be queued.' }, { status: 500 });
  }

  if (!enqueueError || requeuedDeadLetter) {
    const now = new Date().toISOString();
    await (supabase as any)
      .from('merchant_carrier_integrations')
      .update({
        last_webhook_received_at: now,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      })
      .eq('id', integration.id);
  }

  // Svix expects a fast 2xx. The Railway worker performs order matching,
  // timeline writes and notification dispatch from the durable queue.
  return NextResponse.json({
    success: true,
    queued: !enqueueError || requeuedDeadLetter,
    deduplicated,
    requeued: requeuedDeadLetter,
    event: verified.event.eventType,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
