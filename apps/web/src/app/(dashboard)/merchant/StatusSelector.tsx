'use client';

import React, { useState } from 'react';
import { updateOrderStatus } from './actions';

interface Props {
  orderId: string;
  currentStatus: string;
}

export function StatusSelector({ orderId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setLoading(true);

    const formData = new FormData();
    formData.append('order_id', orderId);
    formData.append('status', newStatus);

    await updateOrderStatus(formData);
    setLoading(false);
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <select
        value={status}
        onChange={handleChange}
        disabled={loading}
        style={{
          padding: '0.35rem 0.6rem',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          fontSize: '0.85rem',
          backgroundColor: loading ? '#f3f4f6' : '#ffffff',
          fontWeight: '600',
          cursor: loading ? 'wait' : 'pointer',
          outline: 'none',
        }}
      >
        <option value="order_placed">📝 تم استلام الطلب</option>
        <option value="processing">📦 قيد التجهيز</option>
        <option value="shipped">🚚 في الطريق (تم الشحن)</option>
        <option value="delivered">✅ تم التسليم بنجاح</option>
        <option value="cancelled">❌ ملغي</option>
      </select>
      {loading && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>...</span>}
    </div>
  );
}