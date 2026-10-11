import React from 'react';
import { getSupabaseAdminClient } from '@saas/database';
import { TrackingLiveView } from './TrackingLiveView';
import styles from './t.module.css';

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function TrackingPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { uuid } = resolvedParams;

  const supabase = getSupabaseAdminClient();

  // 1. جلب الطلب
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, external_order_id, customer_name, merchants(store_name)')
    .eq('tracking_uuid', uuid)
    .maybeSingle();

  if (orderError || !order) {
    return (
      <div className={styles.errorContainer}>
        <h2>عذراً، الرابط غير صحيح أو منتهي الصلاحية.</h2>
        <p>يرجى التأكد من الرابط المرسل إليك.</p>
      </div>
    );
  }

  // 2. جلب السجل الزمني الأولي
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

  return (
    <TrackingLiveView
      orderId={order.id}
      externalOrderId={order.external_order_id}
      customerName={order.customer_name}
      storeName={storeName}
      initialEvents={formattedEvents}
    />
  );
}