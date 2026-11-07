import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

/**
 * POST /api/confirmation/enqueue
 * Body: { order_id: string }
 * Header: x-api-key: <merchant api key>
 *
 * Enqueues a confirmation message job for the given order.
 * Only works if the merchant has an active paid plan AND confirmation_telegram_enabled = true.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body?.order_id as string | undefined;

    if (!orderId) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Fetch order + merchant in one query
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, merchant_id, customer_phone, confirmation_status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch merchant
    const { data: merchant, error: merchantErr } = await supabase
      .from('merchants')
      .select('id, subscription_tier, subscription_status, subscription_expires_at, confirmation_telegram_enabled')
      .eq('id', order.merchant_id)
      .maybeSingle();

    if (merchantErr || !merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    // Guard: paid plan
    const tier = merchant.subscription_tier || 'starter';
    const isPaid = tier !== 'starter' && merchant.subscription_status === 'active';
    if (!isPaid) {
      return NextResponse.json({ error: 'confirmation_requires_paid_plan' }, { status: 403 });
    }

    // Guard: feature enabled
    if (!(merchant as any).confirmation_telegram_enabled) {
      return NextResponse.json({ error: 'confirmation_not_enabled' }, { status: 403 });
    }

    // Guard: no phone
    if (!order.customer_phone) {
      return NextResponse.json({ error: 'no_customer_phone' }, { status: 422 });
    }

    // Guard: already has a pending/sent confirmation
    if (order.confirmation_status === 'pending' || order.confirmation_status === 'confirmed') {
      return NextResponse.json({ skipped: true, reason: 'already_enqueued' });
    }

    // Idempotency key = merchant_id + order_id + "confirm"
    const idempotencyKey = `confirm:${order.merchant_id}:${order.id}`;

    const { error: insertErr } = await supabase
      .from('order_confirmation_outbox')
      .insert({
        order_id: order.id,
        merchant_id: order.merchant_id,
        idempotency_key: idempotencyKey,
      });

    if (insertErr) {
      // Duplicate idempotency key = already enqueued
      if (insertErr.code === '23505') {
        return NextResponse.json({ skipped: true, reason: 'already_enqueued' });
      }
      console.error('[ConfirmEnqueue]: Insert error:', insertErr.message);
      return NextResponse.json({ error: 'Failed to enqueue' }, { status: 500 });
    }

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (err: any) {
    console.error('[ConfirmEnqueue]: Unexpected error:', err?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

