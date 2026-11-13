import React, { cache } from 'react';
import type { Metadata } from 'next';
import { getSupabaseAdminClient } from '@saas/database';
import { TrackingLiveView } from './TrackingLiveView';
import styles from './t.module.css';

interface PageProps {
  params: Promise<{ uuid: string }>;
}

const getTrackingOrder = cache(async (uuid: string) => {
  const supabase = getSupabaseAdminClient();
  return supabase
    .from('orders')
    .select('id, merchant_id, external_order_id, customer_name, product_name, product_image, current_status, carrier_name, carrier_tracking_number, confirmation_status, merchants(store_name, logo_url)')
    .eq('tracking_uuid', uuid)
    .maybeSingle();
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { uuid } = await params;
  const { data: order } = await getTrackingOrder(uuid);
  const merchant = Array.isArray(order?.merchants) ? order.merchants[0] : order?.merchants;
  const storeName = merchant?.store_name || 'المتجر';

  return {
    title: order ? 'تتبّع شحنتك لدى ' + storeName : 'تتبّع الشحنة',
    description: order
      ? 'تابع آخر حالة وتحديثات شحنتك لدى ' + storeName + ' من صفحة التتبّع الخاصة بطلبك.'
      : 'صفحة تتبّع الشحنة في تاجر تراك.',
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false, noarchive: true },
    },
  };
}

export default async function TrackingPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { uuid } = resolvedParams;

  const supabase = getSupabaseAdminClient();

  // The shared request-cached lookup also powers generateMetadata above.
  const { data: order, error: orderError } = await getTrackingOrder(uuid);

  if (orderError || !order) {
    return (
      <div className={styles.errorContainer}>
        <h2>عذراً، الرابط غير صحيح أو منتهي الصلاحية.</h2>
        <p>يرجى التأكد من الرابط المرسل إليك.</p>
      </div>
    );
  }

  // 2. جلب الهوية البصرية وإعدادات التخصيص الكاملة (White-Label Branding)
  const { data: brandMappings } = await supabase
    .from('status_mappings')
    .select('source_status, display_status')
    .eq('merchant_id', order.merchant_id);

  const brandJsonRow = brandMappings?.find((m) => m.source_status === '__brand_settings_json__');
  let brandSettings = undefined;

  if (brandJsonRow?.display_status) {
    try {
      brandSettings = JSON.parse(brandJsonRow.display_status);
    } catch {
      // fallback
    }
  }

  const fallbackColor =
    brandMappings?.find((m) => m.source_status === '__brand_primary_color__')?.display_status ||
    '#09090B';
  const fallbackSubtitle =
    brandMappings?.find((m) => m.source_status === '__brand_subtitle__')?.display_status || '';

  // 3. جلب السجل الزمني الأولي
  const { data: history } = await supabase
    .from('order_history')
    .select('id, status_title, description, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  const formattedEvents = (history || []).map((h, index) => ({
    id: h.id,
    title: h.status_title,
    date: h.created_at,
    description: h.description,
    isCurrent: index === 0,
  }));

  const storeName = Array.isArray(order.merchants)
    ? order.merchants[0]?.store_name
    : (order.merchants as any)?.store_name || 'المتجر';

  // merchants.logo_url is canonical; use the previous JSON value only for legacy records.
  const merchantLogoUrl: string | null =
    (Array.isArray(order.merchants)
      ? (order.merchants[0] as any)?.logo_url
      : (order.merchants as any)?.logo_url) ||
    (brandSettings as any)?.logoUrl ||
    null;

  // 4. جلب المنتجات المقترحة (قد يعجبك أيضاً)
  const { data: upsells } = await supabase
    .from('merchant_upsells')
    .select('id, title, image_url, product_url, price, currency')
    .eq('merchant_id', order.merchant_id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(8);

  const exchangeRequestsEnabled = Boolean(brandMappings?.some((mapping) => mapping.source_status === '__feature_exchange_requests_enabled__' && mapping.display_status === 'true'));
  let exchangeRequestsStorageAvailable = true;
  let initialExchangeRequest: any = null;
  if (exchangeRequestsEnabled) {
    const { data: latestRequest, error: exchangeRequestError } = await (supabase as any).from('order_exchange_requests')
      .select('id, status, reason, customer_note, merchant_response, created_at')
      .eq('order_id', order.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (exchangeRequestError) { exchangeRequestsStorageAvailable = false; console.error('[TrackingPage] Could not load exchange request:', exchangeRequestError.message); }
    else if (latestRequest) {
      const { data: replacementShipment, error: replacementShipmentError } = await (supabase as any)
        .from('order_exchange_shipments')
        .select('id, carrier_name, carrier_tracking_number, carrier_order_id, customer_name, customer_phone, product_name, current_status, status_title, created_at')
        .eq('exchange_request_id', latestRequest.id)
        .eq('match_status', 'linked')
        .maybeSingle();
      if (replacementShipmentError) {
        exchangeRequestsStorageAvailable = false;
        console.error('[TrackingPage] Could not load replacement shipment:', replacementShipmentError.message);
      }
      initialExchangeRequest = { ...latestRequest, replacement_shipment: replacementShipment || null };
    }
  }

  return (
    <TrackingLiveView
      orderId={order.id}
      currentStatus={order.current_status}
      exchangeRequestsEnabled={exchangeRequestsEnabled}
      initialExchangeRequest={initialExchangeRequest}
      exchangeRequestsStorageAvailable={exchangeRequestsStorageAvailable}
      trackingUuid={uuid}
      externalOrderId={order.external_order_id}
      customerName={order.customer_name}
      productName={order.product_name}
      productImage={order.product_image}
      carrierName={order.carrier_name}
      carrierTrackingNumber={order.carrier_tracking_number}
      initialConfirmationStatus={order.confirmation_status}
      storeName={storeName}
      logoUrl={merchantLogoUrl}
      brandSettings={brandSettings}
      brandColor={fallbackColor}
      brandSubtitle={fallbackSubtitle}
      initialEvents={formattedEvents}
      upsells={upsells || []}
    />
  );
}