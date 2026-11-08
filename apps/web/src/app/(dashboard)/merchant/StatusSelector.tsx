'use client';

import React, { useEffect, useState } from 'react';
import { updateOrderStatus } from './actions';
import { BrandedSelect } from './BrandedSelect';
import type { BrandedSelectOption } from './BrandedSelect';

const BASE_STATUS_OPTIONS: BrandedSelectOption[] = [
  { value: 'order_placed', label: 'تم استلام الطلب' },
  { value: 'processing', label: 'قيد التجهيز في المستودع' },
  { value: 'shipped', label: 'خرج للشحن والتوصيل' },
  { value: 'in_transit', label: 'في الطريق بين الولايات' },
  { value: 'out_for_delivery', label: 'مع المندوب للتسليم اليوم' },
  { value: 'ready_for_pickup', label: 'جاهز للاستلام (Stopdesk)' },
  { value: 'attempt_failed_no_answer', label: 'تنبيه: تعذر الاتصال / مغلق' },
  { value: 'delivered', label: 'تم التسليم بنجاح' },
  { value: 'returned', label: 'مرتجع إلى المتجر' },
  { value: 'cancelled', label: 'ملغي' },
];

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

  async function handleChange(newStatus: string) {
    if (newStatus === status || loading) return;

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

  const statusOptions = BASE_STATUS_OPTIONS.some((option) => option.value === status)
    ? BASE_STATUS_OPTIONS
    : [...BASE_STATUS_OPTIONS, { value: status, label: status }];

  return (
    <div className="dz-status-selector" aria-busy={loading} style={{ opacity: loading ? 0.72 : 1 }}>
      <BrandedSelect
        ariaLabel="تغيير حالة الشحنة"
        value={status}
        onChange={handleChange}
        options={statusOptions}
        variant="status"
        loading={loading}
      />
      {errorMessage && <span className="dz-status-select-error" role="alert">{errorMessage}</span>}
    </div>
  );
}
