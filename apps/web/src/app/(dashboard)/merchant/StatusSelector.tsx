'use client';

import React, { useEffect, useState } from 'react';
import { updateOrderStatus } from './actions';

interface Props {
  orderId: string;
  currentStatus: string;
}

export function StatusSelector({ orderId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('order_id', orderId);
    formData.append('status', newStatus);

    try {
      const result = await updateOrderStatus(formData);
      if (result && 'success' in result && result.success) {
        setStatus(newStatus);
      } else {
        setStatus(currentStatus);
        setErrorMessage(result && 'error' in result ? result.error : 'تعذر حفظ الحالة. حاول مرة أخرى.');
      }
    } catch {
      setStatus(currentStatus);
      setErrorMessage('تعذر حفظ الحالة بسبب مشكلة في الاتصال.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        opacity: loading ? 0.7 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes statusSelectorSpin {
              100% { transform: rotate(360deg); }
            }
          `,
        }}
      />

      <select
        aria-label="تغيير حالة الشحنة"
        value={status}
        onChange={handleChange}
        disabled={loading}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          padding: '0.4rem 0.75rem 0.4rem 1.9rem',
          borderRadius: '8px',
          border: '1px solid rgba(9, 9, 11, 0.1)',
          fontSize: '0.78rem',
          fontWeight: '600',
          backgroundColor: '#FFFFFF',
          color: '#09090B',
          cursor: loading ? 'wait' : 'pointer',
          outline: 'none',
          fontFamily: 'inherit',
          boxShadow: '0 1px 2px rgba(9, 9, 11, 0.03)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#09090B';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(9, 9, 11, 0.05)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(9, 9, 11, 0.1)';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(9, 9, 11, 0.03)';
        }}
      >
        <option value="order_placed">تم استلام الطلب</option>
        <option value="processing">قيد التجهيز في المستودع</option>
        <option value="in_transit">في الطريق بين الولايات</option>
        <option value="out_for_delivery">مع المندوب للتسليم اليوم</option>
        <option value="ready_for_pickup">جاهز للاستلام (Stopdesk)</option>
        <option value="attempt_failed_no_answer">تنبيه: تعذر الاتصال / مغلق</option>
        <option value="delivered">تم التسليم بنجاح</option>
        <option value="returned">مرتجع إلى المتجر</option>
        <option value="cancelled">ملغي</option>

        {![
          'order_placed',
          'processing',
          'shipped',
          'in_transit',
          'out_for_delivery',
          'ready_for_pickup',
          'attempt_failed_no_answer',
          'delivered',
          'returned',
          'cancelled',
        ].includes(status) && (
          <option value={status}>{status}</option>
        )}
      </select>

      <span
        style={{
          position: 'absolute',
          left: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          color: '#71717A',
        }}
      >
        {loading ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: 'statusSelectorSpin 0.9s linear infinite' }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </span>
      {errorMessage && <span role="alert" style={{ display: 'block', maxWidth: '220px', marginTop: '5px', color: '#a43f35', fontSize: '10px', lineHeight: 1.5 }}>{errorMessage}</span>}
    </div>
  );
}