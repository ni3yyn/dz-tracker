import React, { cache } from 'react';
import type { Metadata } from 'next';
import { getSupabaseAdminClient } from '@saas/database';
import { ConfirmOrderView } from './ConfirmOrderView';
import type { BrandSettings } from '@saas/ui';

interface Props {
  params: Promise<{ token: string }>;
}

const getConfirmationOrder = cache(async (token: string) => {
  const supabase = getSupabaseAdminClient();
  return supabase
    .from('orders')
    .select('id, external_order_id, customer_name, product_name, product_image, merchant_id, confirmation_status, confirmation_expires_at, merchants(store_name, logo_url)')
    .eq('confirmation_token', token)
    .maybeSingle();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const { data: order } = await getConfirmationOrder(token);
  const merchant = Array.isArray(order?.merchants) ? order.merchants[0] : order?.merchants;
  const storeName = merchant?.store_name || 'المتجر';

  return {
    title: order ? 'تأكيد الطلب من ' + storeName : 'تأكيد الطلب',
    description: order
      ? 'راجع تفاصيل طلبك من ' + storeName + ' وأكّد استلام المتجر لطلبك.'
      : 'صفحة تأكيد الطلب في تاجر تراك.',
  };
}

export default async function ConfirmOrderPage({ params }: Props) {
  const { token } = await params;
  const supabase = getSupabaseAdminClient();

  // Shared with generateMetadata so the merchant lookup is not repeated per request.
  const { data: order, error } = await getConfirmationOrder(token);

  if (error || !order) {
    return <ConfirmOrderView status="invalid" token={token} />;
  }

  // The joined merchant identity is shared by the page and its browser title.
  const merchant = Array.isArray(order.merchants) ? order.merchants[0] : order.merchants;
  const [{ data: brandColorRow }, { data: legacyBrandSettingsRow }, { data: brandSubtitleRow }] = await Promise.all([
    supabase
      .from('status_mappings')
      .select('display_status')
      .eq('merchant_id', order.merchant_id)
      .eq('source_status', '__brand_primary_color__')
      .maybeSingle(),
    supabase
      .from('status_mappings')
      .select('display_status')
      .eq('merchant_id', order.merchant_id)
      .eq('source_status', '__brand_settings_json__')
      .maybeSingle(),
    supabase
      .from('status_mappings')
      .select('display_status')
      .eq('merchant_id', order.merchant_id)
      .eq('source_status', '__brand_subtitle__')
      .maybeSingle(),
  ]);

  // Use the exact saved settings object used by the tracking page. The
  // dedicated mapping rows remain authoritative for the color and subtitle.
  let savedBrandSettings: (Partial<BrandSettings> & {
    logoUrl?: string;
    showWhatsAppButton?: boolean;
    animateBackgroundBlobs?: boolean;
    backgroundBlur?: boolean;
  }) | undefined;
  if (legacyBrandSettingsRow?.display_status) {
    try {
      const parsed = JSON.parse(legacyBrandSettingsRow.display_status);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        savedBrandSettings = parsed;
      }
    } catch {
      savedBrandSettings = undefined;
    }
  }

  const legacyLogoUrl = typeof savedBrandSettings?.logoUrl === 'string'
    ? savedBrandSettings.logoUrl
    : undefined;
  const savedBrandColor = typeof savedBrandSettings?.brandColor === 'string'
    ? savedBrandSettings.brandColor
    : undefined;
  const savedBrandSubtitle = typeof savedBrandSettings?.brandSubtitle === 'string'
    ? savedBrandSettings.brandSubtitle
    : undefined;

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
      logoUrl={merchant?.logo_url || legacyLogoUrl}
      brandColor={brandColorRow?.display_status || savedBrandColor || '#27342D'}
      brandSubtitle={brandSubtitleRow?.display_status || savedBrandSubtitle || ''}
      brandSettings={savedBrandSettings}
    />
  );
}
