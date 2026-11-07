import React from 'react';
import { getSupabaseAdminClient } from '@saas/database';
import { ConfirmOrderView } from './ConfirmOrderView';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ConfirmOrderPage({ params }: Props) {
  const { token } = await params;
  const supabase = getSupabaseAdminClient();

  // Look up order by token
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, external_order_id, customer_name, product_name, merchant_id, confirmation_status, confirmation_expires_at')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (error || !order) {
    return (
      <ConfirmOrderView
        status="invalid"
        token={token}
      />
    );
  }

  // Check expiry
  const isExpired =
    order.confirmation_expires_at &&
    new Date(order.confirmation_expires_at).getTime() < Date.now();

  if (isExpired) {
    return (
      <ConfirmOrderView
        status="expired"
        token={token}
        orderNumber={order.external_order_id}
        customerName={order.customer_name ?? undefined}
      />
    );
  }

  // Already responded
  if (order.confirmation_status === 'confirmed' || order.confirmation_status === 'cancelled') {
    return (
      <ConfirmOrderView
        status={order.confirmation_status}
        token={token}
        orderNumber={order.external_order_id}
        customerName={order.customer_name ?? undefined}
      />
    );
  }

  // Fetch merchant name for display
  const { data: merchant } = await supabase
    .from('merchants')
    .select('store_name, logo_url')
    .eq('id', order.merchant_id)
    .maybeSingle();

  return (
    <ConfirmOrderView
      status="pending"
      token={token}
      orderNumber={order.external_order_id}
      customerName={order.customer_name ?? undefined}
      productName={order.product_name ?? undefined}
      storeName={merchant?.store_name ?? undefined}
      logoUrl={(merchant as any)?.logo_url ?? undefined}
    />
  );
}

