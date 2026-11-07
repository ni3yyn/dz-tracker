'use client';

import React, { useState, useTransition } from 'react';
import { respondToConfirmation } from './actions';

type ConfirmStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'invalid';

interface Props {
  status: ConfirmStatus;
  token: string;
  orderNumber?: string;
  customerName?: string;
  productName?: string;
  storeName?: string;
  logoUrl?: string;
}

export function ConfirmOrderView({
  status: initialStatus,
  token,
  orderNumber,
  customerName,
  productName,
  storeName,
  logoUrl,
}: Props) {
  const [status, setStatus] = useState<ConfirmStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

  const handleResponse = (action: 'confirm' | 'cancel') => {
    startTransition(async () => {
      const result = await respondToConfirmation(token, action);
      if (result.success) {
        setStatus(action === 'confirm' ? 'confirmed' : 'cancelled');
      }
    });
  };

  const storeLetter = storeName?.trim()[0]?.toUpperCase() || 'م';

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f4f7f4',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'Readex Pro', 'Noto Sans Arabic', system-ui, sans-serif",
      direction: 'rtl',
    }}>
      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: '32px 24px',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        {/* Logo / Avatar */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#27342d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          overflow: 'hidden',
        }}>
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>{storeLetter}</span>
          )}
        </div>

        {storeName && (
          <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 4px' }}>{storeName}</p>
        )}

        {/* Status-specific content */}
        {status === 'pending' && (
          <PendingView
            orderNumber={orderNumber}
            customerName={customerName}
            productName={productName}
            isPending={isPending}
            onConfirm={() => handleResponse('confirm')}
            onCancel={() => handleResponse('cancel')}
          />
        )}

        {status === 'confirmed' && (
          <ResponseView
            icon="✅"
            title="تم تأكيد طلبك"
            message="شكراً! تم تأكيد طلبك بنجاح وسيتم التواصل معك قريباً."
            color="#15803d"
            bg="rgba(21,128,61,0.08)"
          />
        )}

        {status === 'cancelled' && (
          <ResponseView
            icon="❌"
            title="تم إلغاء الطلب"
            message="تم تسجيل طلبك للإلغاء. سيتواصل معك فريق المتجر إن احتجت مساعدة."
            color="#dc2626"
            bg="rgba(220,38,38,0.08)"
          />
        )}

        {status === 'expired' && (
          <ResponseView
            icon="⏰"
            title="انتهت صلاحية الرابط"
            message="انتهت صلاحية رابط التأكيد. يرجى التواصل مع المتجر مباشرة."
            color="#d97706"
            bg="rgba(217,119,6,0.08)"
          />
        )}

        {status === 'invalid' && (
          <ResponseView
            icon="🔗"
            title="رابط غير صالح"
            message="هذا الرابط غير صالح أو تم استخدامه من قبل."
            color="#64748b"
            bg="rgba(100,116,139,0.08)"
          />
        )}

        {/* Footer */}
        <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 24, marginBottom: 0 }}>
          مشغّل بواسطة TajerTrack
        </p>
      </div>
    </div>
  );
}

function PendingView({
  orderNumber,
  customerName,
  productName,
  isPending,
  onConfirm,
  onCancel,
}: {
  orderNumber?: string;
  customerName?: string;
  productName?: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
        تأكيد الطلب
      </h1>
      {customerName && (
        <p style={{ color: '#475569', fontSize: 14, margin: '0 0 16px' }}>
          مرحباً {customerName} 👋
        </p>
      )}

      {/* Order summary box */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 24,
        textAlign: 'right',
      }}>
        {orderNumber && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: productName ? 6 : 0 }}>
            <span style={{ color: '#94a3b8' }}>رقم الطلب</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>#{orderNumber}</span>
          </div>
        )}
        {productName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
            <span style={{ color: '#94a3b8' }}>المنتج</span>
            <span style={{ fontWeight: 500, color: '#0f172a', maxWidth: 180, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productName}</span>
          </div>
        )}
      </div>

      <p style={{ color: '#475569', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
        هل تريد تأكيد هذا الطلب والمتابعة؟
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
        <button
          onClick={onConfirm}
          disabled={isPending}
          style={{
            background: isPending ? '#94a3b8' : '#15803d',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '14px 20px',
            fontSize: 15,
            fontWeight: 700,
            cursor: isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.2s',
            width: '100%',
          }}
        >
          {isPending ? 'جاري المعالجة...' : '✅ نعم، أؤكد طلبي'}
        </button>

        <button
          onClick={onCancel}
          disabled={isPending}
          style={{
            background: 'transparent',
            color: isPending ? '#94a3b8' : '#dc2626',
            border: `1.5px solid ${isPending ? '#e2e8f0' : '#fecaca'}`,
            borderRadius: 12,
            padding: '13px 20px',
            fontSize: 14,
            fontWeight: 600,
            cursor: isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
            width: '100%',
          }}
        >
          ❌ إلغاء الطلب
        </button>
      </div>
    </>
  );
}

function ResponseView({
  icon,
  title,
  message,
  color,
  bg,
}: {
  icon: string;
  title: string;
  message: string;
  color: string;
  bg: string;
}) {
  return (
    <>
      <div style={{
        fontSize: 48,
        lineHeight: 1,
        margin: '0 0 16px',
      }}>
        {icon}
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color, margin: '0 0 12px' }}>
        {title}
      </h1>
      <div style={{
        background: bg,
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 8,
      }}>
        <p style={{ color: '#475569', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
    </>
  );
}

