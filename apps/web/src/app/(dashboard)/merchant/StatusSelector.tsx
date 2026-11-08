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
    <div className="dz-status-selector" aria-busy={loading} style={{ opacity: loading ? 0.68 : 1 }}>


      <select
        className="dz-status-select"
        aria-label="تغيير حالة الشحنة"
        value={status}
        onChange={handleChange}
        disabled={loading}
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

      <span className="dz-status-select-icon" aria-hidden="true">
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
            className="dz-status-select-spinner"
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
      {errorMessage && <span className="dz-status-select-error" role="alert">{errorMessage}</span>}
    </div>
  );
}