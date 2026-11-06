import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseAdminClient } from '@saas/database';

export const dynamic = 'force-dynamic';

// Allowed push service hostname patterns for strict SSRF protection
const ALLOWED_PUSH_HOST_PATTERNS = [
  /^([a-z0-9-]+\.)*push\.apple\.com$/i,
  /^([a-z0-9-]+\.)*googleapis\.com$/i,
  /^([a-z0-9-]+\.)*google\.com$/i,
  /^([a-z0-9-]+\.)*services\.mozilla\.com$/i,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/i,
  /^([a-z0-9-]+\.)*wns\.windows\.com$/i,
];

function isSafePushEndpoint(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block private ranges, loopback, and local hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return false;
    }

    return ALLOWED_PUSH_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    if (!uuid) {
      return NextResponse.json({ error: 'Missing tracking UUID' }, { status: 400 });
    }

    const body = await request.json();
    const sub = body.subscription || body;

    if (!sub || typeof sub.endpoint !== 'string' || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
      return NextResponse.json({ error: 'Invalid PushSubscription payload' }, { status: 400 });
    }

    if (!isSafePushEndpoint(sub.endpoint)) {
      return NextResponse.json({ error: 'Push service endpoint rejected by security policy' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // 1. Resolve order by tracking_uuid
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, merchant_id')
      .eq('tracking_uuid', uuid)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    const endpointHash = crypto.createHash('sha256').update(sub.endpoint).digest('hex');
    const userAgent = request.headers.get('user-agent')?.slice(0, 255) || null;

    // 2. Upsert device in web_push_subscriptions
    const { data: device, error: deviceErr } = await supabase
      .from('web_push_subscriptions')
      .upsert(
        {
          endpoint: sub.endpoint,
          endpoint_hash: endpointHash,
          p256dh: sub.keys.p256dh,
          auth_secret: sub.keys.auth,
          expiration_time: sub.expirationTime ? new Date(sub.expirationTime).toISOString() : null,
          status: 'active',
          user_agent: userAgent,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint_hash' }
      )
      .select('id')
      .single();

    if (deviceErr || !device) {
      console.error('[WebPush API]: Error upserting device subscription:', deviceErr?.message);
      return NextResponse.json({ error: 'Failed to record device subscription' }, { status: 500 });
    }

    // 3. Associate device with this specific order
    const { error: assocErr } = await supabase
      .from('order_push_subscriptions')
      .upsert(
        {
          order_id: order.id,
          push_subscription_id: device.id,
          subscribed_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: 'order_id, push_subscription_id' }
      );

    if (assocErr) {
      console.error('[WebPush API]: Error creating order-device association:', assocErr.message);
      return NextResponse.json({ error: 'Failed to link shipment subscription' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      subscribed: true,
      orderId: order.id,
    });
  } catch (err: any) {
    console.error('[WebPush API]: Unexpected exception during subscribe:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    if (!uuid) {
      return NextResponse.json({ error: 'Missing tracking UUID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const endpoint = body.endpoint || body.subscription?.endpoint;

    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Missing push subscription endpoint' }, { status: 400 });
    }

    const endpointHash = crypto.createHash('sha256').update(endpoint).digest('hex');
    const supabase = getSupabaseAdminClient();

    // 1. Resolve order by tracking_uuid
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('tracking_uuid', uuid)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    // 2. Resolve device by endpoint hash
    const { data: device } = await supabase
      .from('web_push_subscriptions')
      .select('id')
      .eq('endpoint_hash', endpointHash)
      .maybeSingle();

    if (!device) {
      return NextResponse.json({ success: true, remainingActiveOrders: 0 });
    }

    // 3. Mark the shipment association as revoked
    const { data: assoc } = await supabase
      .from('order_push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('order_id', order.id)
      .eq('push_subscription_id', device.id)
      .select('id')
      .maybeSingle();

    // 4. Cancel any pending outbox jobs for this order-device association
    if (assoc) {
      await supabase
        .from('web_push_outbox')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('order_push_subscription_id', assoc.id)
        .eq('status', 'pending');
    }

    // 5. Count how many other active shipment associations remain for this device
    const { count } = await supabase
      .from('order_push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('push_subscription_id', device.id)
      .is('revoked_at', null);

    const remainingActiveOrders = count || 0;

    // 6. If no other orders are subscribed on this browser, mark device revoked
    if (remainingActiveOrders === 0) {
      await supabase
        .from('web_push_subscriptions')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', device.id);
    }

    return NextResponse.json({
      success: true,
      subscribed: false,
      remainingActiveOrders,
    });
  } catch (err: any) {
    console.error('[WebPush API]: Unexpected exception during unsubscribe:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

