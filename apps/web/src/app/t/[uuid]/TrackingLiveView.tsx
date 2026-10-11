'use client';

import React, { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@saas/database';
import { Timeline, TimelineEvent } from '@saas/ui';
import styles from './t.module.css';

interface Props {
  orderId: string;
  externalOrderId: string;
  customerName: string | null;
  productName: string | null;
  storeName: string;
  initialEvents: TimelineEvent[];
}

export function TrackingLiveView({
  orderId,
  externalOrderId,
  customerName,
  productName,
  storeName,
  initialEvents,
}: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
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
          setEvents((prevEvents) => [
            {
              id: newRow.id,
              title: newRow.status_title,
              date: newRow.created_at,
              description: newRow.description,
              isCurrent: true,
            },
            ...prevEvents.map((e) => ({ ...e, isCurrent: false })),
          ]);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLive(true);
        }
      });

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

          {/* 📦 شريط اسم المنتج النصي الأنيق (بدون صور) */}
          {productName && (
            <div style={{
              marginTop: '0.9rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.5rem 0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.88rem',
              color: '#475569',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>محتوى الطلب:</span>
              <span style={{ color: '#0f172a', fontWeight: 700 }}>{productName}</span>
            </div>
          )}
        </header>

        <section className={styles.trackingSection}>
          <Timeline events={events} />
        </section>
      </div>
    </main>
  );
}