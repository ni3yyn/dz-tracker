import React from 'react';
import { getSupabaseAdminClient } from '@saas/database';
import { Timeline } from '@saas/ui';
import styles from './t.module.css';

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function TrackingPage({ params }: PageProps) {
  // 1. فك الـ Promise الخاص بـ params (متوافق مع Next.js 15 و 16)
  const resolvedParams = await params;
  const { uuid } = resolvedParams;

  // 2. استخدام Admin Client في السيرفر لضمان جلب البيانات بأمان وتجاوز قيود الـ RLS
  const supabase = getSupabaseAdminClient();

  // 3. جلب الطلب بناءً على الرابط السري (UUID)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, external_order_id, customer_name, merchants(store_name)')
    .eq('tracking_uuid', uuid)
    .maybeSingle();

  if (orderError) {
    console.error('❌ Tracking Page Lookup Error:', orderError);
  }

  if (orderError || !order) {
    return (
      <div className={styles.errorContainer}>
        <h2>عذراً، الرابط غير صحيح أو منتهي الصلاحية.</h2>
        <p>يرجى التأكد من الرابط المرسل إليك.</p>
      </div>
    );
  }

  // 4. جلب السجل الزمني للطلب (الأحدث أولاً)
  const { data: history } = await supabase
    .from('order_history')
    .select('id, status_title, description, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  // تحويل البيانات لتناسب مكون الـ Timeline
  const formattedEvents = (history || []).map((h, index) => ({
    id: h.id,
    title: h.status_title,
    date: h.created_at,
    description: h.description,
    isCurrent: index === 0, // العنصر الأحدث هو الحالة الحالية
  }));

  // استخراج اسم المتجر بأمان
  const storeName = Array.isArray(order.merchants) 
    ? order.merchants[0]?.store_name 
    : (order.merchants as any)?.store_name || 'متجر الأناقة';

  return (
    <main className={styles.pageContainer}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.storeName}>{storeName}</h1>
          <p className={styles.orderNumber}>
            طلب رقم: <span dir="ltr">{order.external_order_id}</span>
          </p>
          {order.customer_name && (
            <p className={styles.greeting}>مرحباً بك، {order.customer_name}</p>
          )}
        </header>

        <section className={styles.trackingSection}>
          <Timeline events={formattedEvents} />
        </section>
      </div>
    </main>
  );
}