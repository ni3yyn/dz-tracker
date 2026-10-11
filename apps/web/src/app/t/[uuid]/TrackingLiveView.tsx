'use client';

import React, { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@saas/database';
import { Timeline, TimelineEvent } from '@saas/ui';
import styles from './t.module.css';

interface Props {
  orderId: string;
  externalOrderId: string;
  customerName: string | null;
  storeName: string;
  initialEvents: TimelineEvent[];
}

export function TrackingLiveView({
  orderId,
  externalOrderId,
  customerName,
  storeName,
  initialEvents,
}: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    // 1. فتح اتصال المتصفح بالـ WebSocket
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`realtime-order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_history',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newRow = payload.new as any;

          // 2. تحديث قائمة الأحداث لحظياً بدون إعادة تحميل الصفحة!
          setEvents((prevEvents) => [
            {
              id: newRow.id,
              title: newRow.status_title,
              date: newRow.created_at,
              description: newRow.description,
              isCurrent: true, // الحدث الجديد يصبح هو الحالي
            },
            ...prevEvents.map((e) => ({ ...e, isCurrent: false })), // الحالات السابقة تصبح رمادية
          ]);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLive(true);
        }
      });

    // إغلاق قناة الاتصال عند مغادرة الصفحة
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  return (
    <main className={styles.pageContainer}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: isLive ? '#15803d' : '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isLive ? '#22c55e' : '#cbd5e1', display: 'inline-block' }}></span>
              {isLive ? 'تتبع مباشر (Live)' : 'جاري الاتصال...'}
            </span>
          </div>

          <h1 className={styles.storeName}>{storeName}</h1>
          <p className={styles.orderNumber}>
            طلب رقم: <span dir="ltr">{externalOrderId}</span>
          </p>
          {customerName && (
            <p className={styles.greeting}>
              مرحباً بك، {customerName.replace(/[-_]$/, '').trim()}
            </p>
          )}
        </header>

        <section className={styles.trackingSection}>
          <Timeline events={events} />
        </section>
      </div>
    </main>
  );
}