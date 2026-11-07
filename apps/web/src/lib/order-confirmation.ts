import { getSupabaseAdminClient } from '@saas/database';

interface EnqueueOrderConfirmationInput {
  merchantId: string;
  orderId: string;
  customerPhone?: string | null;
}

/**
 * Enqueues a confirmation request for a newly created order.
 *
 * confirmation_status is the customer's order-confirmation stage.
 * current_status remains exclusively the shipment/carrier status.
 */
export async function enqueueOrderConfirmationForNewOrder({
  merchantId,
  orderId,
  customerPhone,
}: EnqueueOrderConfirmationInput): Promise<{ queued: boolean }> {
  if (!customerPhone?.trim()) {
    return { queued: false };
  }

  const supabase = getSupabaseAdminClient();

  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('confirmation_telegram_enabled, subscription_tier, subscription_status')
    .eq('id', merchantId)
    .maybeSingle();

  if (merchantError) {
    throw merchantError;
  }

  const isPaidActivePlan =
    (merchant?.subscription_tier || 'starter') !== 'starter' &&
    merchant?.subscription_status === 'active';
  const confirmationEnabled = Boolean(
    (merchant as any)?.confirmation_telegram_enabled
  );

  if (!isPaidActivePlan || !confirmationEnabled) {
    return { queued: false };
  }

  const { error: enqueueError } = await supabase
    .from('order_confirmation_outbox')
    .insert({
      order_id: orderId,
      merchant_id: merchantId,
      idempotency_key: `confirm:${merchantId}:${orderId}`,
    });

  // A unique-key conflict means the confirmation job already exists.
  if (enqueueError && enqueueError.code !== '23505') {
    throw enqueueError;
  }

  // Mark the customer-confirmation stage immediately, not only after the
  // Telegram worker has generated a token. Never touch current_status here.
  const { error: statusError } = await supabase
    .from('orders')
    .update({ confirmation_status: 'pending' } as any)
    .eq('id', orderId)
    .is('confirmation_status', null);

  if (statusError) {
    throw statusError;
  }

  return { queued: true };
}
