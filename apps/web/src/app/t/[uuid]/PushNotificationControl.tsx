'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Props {
  trackingUuid: string;
  brandColor?: string;
}

function urlB64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export function PushNotificationControl({ trackingUuid, brandColor = '#10b981' }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [isIOSBrowser, setIsIOSBrowser] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 1. Initial Browser & Service Worker Capability Detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSW = 'serviceWorker' in navigator;
    const hasPush = 'PushManager' in window;
    const hasNotification = 'Notification' in window;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as any).standalone);

    if (isIOS && !isStandalone) {
      setIsIOSBrowser(true);
      setSupported(false);
      return;
    }

    if (!hasSW || !hasPush || !hasNotification) {
      setSupported(false);
      return;
    }

    setSupported(true);

    if (Notification.permission === 'denied') {
      setPermissionDenied(true);
    }

    // Check if device already holds an active PushSubscription
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) {
          // Verify with local storage or state if this shipment is currently linked
          const key = `push_subscribed_${trackingUuid}`;
          if (localStorage.getItem(key) === 'true') {
            setIsSubscribed(true);
          }
        }
      })
      .catch((err) => console.warn('[PushControl]: Readiness check warning:', err));
  }, [trackingUuid]);

  // 2. Subscribe Handler
  const handleSubscribe = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setPermissionDenied(false);

    try {
      // Step A: Register Service Worker at root scope /
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // Step B: Direct user permission request
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPermissionDenied(true);
        setIsLoading(false);
        return;
      }

      // Step C: Resolve VAPID Public Key
      const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('مفتاح VAPID العام غير متوفر في إعدادات التطبيق.');
      }

      // Step D: Obtain or create PushSubscription
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapidPublicKey),
        });
      }

      // Step E: Send subscription to server
      const res = await fetch(`/api/track/${trackingUuid}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل حفظ الاشتراك في الخادم.');
      }

      setIsSubscribed(true);
      localStorage.setItem(`push_subscribed_${trackingUuid}`, 'true');
      setStatusMessage('تم تفعيل الإشعارات بنجاح! ستصلك تنبيهات بكل تحديث على شحنتك.');
    } catch (err: any) {
      console.error('[PushControl]: Subscription error:', err);
      setStatusMessage(err?.message || 'تعذر تفعيل الإشعارات. يرجى المحاولة لاحقاً.');
    } finally {
      setIsLoading(false);
    }
  }, [trackingUuid]);

  // 3. Unsubscribe Handler
  const handleUnsubscribe = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        const res = await fetch(`/api/track/${trackingUuid}/push`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        const data = await res.json();
        // If no other shipments are linked, unsubscribe browser PushManager
        if (data?.remainingActiveOrders === 0) {
          await subscription.unsubscribe();
        }
      }

      setIsSubscribed(false);
      localStorage.removeItem(`push_subscribed_${trackingUuid}`);
      setStatusMessage('تم إلغاء تفعيل إشعارات هذه الشحنة.');
    } catch (err: any) {
      console.error('[PushControl]: Unsubscribe error:', err);
      setStatusMessage('حدث خطأ أثناء إلغاء التفعيل.');
    } finally {
      setIsLoading(false);
    }
  }, [trackingUuid]);

  if (supported === false && isIOSBrowser) {
    return (
      <div style={{
        marginTop: '16px',
        padding: '14px 16px',
        borderRadius: '12px',
        background: 'rgba(2, 132, 199, 0.08)',
        border: '1px solid rgba(2, 132, 199, 0.2)',
        fontSize: '12px',
        lineHeight: 1.6,
        color: '#0369a1',
        textAlign: 'right',
      }}>
        <strong style={{ display: 'block', marginBottom: '4px' }}>📲 للتفعيل على أجهزة آيفون (iOS):</strong>
        اضغط زر المشاركة <span style={{ fontSize: '14px' }}>⎋</span> في متصفح Safari، ثم اختر <strong>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong>. افتح الصفحة من الشاشة الرئيسية لتفعيل إشعارات الشحنة مباشرة.
      </div>
    );
  }

  if (supported === false) {
    return null; // Gracefully omit on completely unsupported environments
  }

  return (
    <div style={{
      marginTop: '18px',
      padding: '16px 18px',
      borderRadius: '14px',
      background: isSubscribed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 24, 19, 0.03)',
      border: `1px solid ${isSubscribed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 24, 19, 0.08)'}`,
      textAlign: 'right',
      transition: 'all 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--ink-main, #111827)' }}>
            <span>{isSubscribed ? '🔔' : '📬'}</span>
            <span>{isSubscribed ? 'الإشعارات مفعلة لهذه الشحنة' : 'إشعارات الشحنة المباشرة'}</span>
          </strong>
          <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--ink-muted, #6b7280)', lineHeight: 1.5 }}>
            {isSubscribed
              ? 'ستصلك رسالة تنبيه فورية على هذا الجهاز عند كل تحديث جديد على مسار الطرد.'
              : 'فعّل الإشعارات لتصلك مستجدات شحنتك فور تغيير حالتها، حتى عند إغلاق الصفحة.'}
          </p>
        </div>

        <div>
          {isSubscribed ? (
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={isLoading}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#6b7280',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: '0.2s',
              }}
            >
              {isLoading ? 'جاري الإلغاء...' : 'إيقاف الإشعارات'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '10px',
                border: 'none',
                background: brandColor,
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                transition: '0.2s',
              }}
            >
              {isLoading ? 'جاري التفعيل...' : 'تفعيل إشعارات الشحنة 🔔'}
            </button>
          )}
        </div>
      </div>

      {permissionDenied && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          borderRadius: '8px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '11px',
          lineHeight: 1.5,
        }}>
          ⚠️ تم رفض إذن الإشعارات سابقاً في هذا المتصفح. لتفعيلها، يرجى الضغط على أيقونة القفل بجانب شريط العنوان والسماح بالإشعارات لهذا الموقع.
        </div>
      )}

      {statusMessage && !permissionDenied && (
        <div style={{
          marginTop: '10px',
          fontSize: '11px',
          color: isSubscribed ? '#059669' : '#4b5563',
          lineHeight: 1.4,
        }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
