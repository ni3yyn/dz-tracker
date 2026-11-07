import React from 'react';
import { getSupabaseAdminClient } from '@saas/database';
import { ConfirmOrderView } from './ConfirmOrderView';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ConfirmOrderPage({ params }: Props) {
  const { token } = await params;
  const supabase = getSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, external_order_id, customer_name, product_name, product_image, merchant_id, confirmation_status, confirmation_expires_at')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (error || !order) {
    return <ConfirmOrderView status="invalid" token={token} />;
  }

  // Load merchant identity before resolving status so every valid state stays branded.
  const [{ data: merchant }, { data: brandColorRow }] = await Promise.all([
    supabase
      .from('merchants')
      .select('store_name, logo_url')
      .eq('id', order.merchant_id)
      .maybeSingle(),
    supabase
      .from('status_mappings')
      .select('display_status')
      .eq('merchant_id', order.merchant_id)
      .eq('source_status', '__brand_primary_color__')
      .maybeSingle(),
  ]);

  const isExpired =
    order.confirmation_expires_at &&
    new Date(order.confirmation_expires_at).getTime() < Date.now();

  const status = isExpired
    ? 'expired'
    : order.confirmation_status === 'confirmed' || order.confirmation_status === 'cancelled'
      ? order.confirmation_status
      : 'pending';

  return (
    <ConfirmOrderView
      status={status}
      token={token}
      orderNumber={order.external_order_id}
      customerName={order.customer_name ?? undefined}
      productName={order.product_name ?? undefined}
      productImage={order.product_image ?? undefined}
      storeName={merchant?.store_name ?? undefined}
      logoUrl={merchant?.logo_url ?? undefined}
      brandColor={brandColorRow?.display_status ?? '#273b30'}
    />
  );
}
