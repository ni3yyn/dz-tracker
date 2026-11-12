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
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);
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
      setUnsupportedMessage('على أجهزة iPhone، افتح هذه الصفحة من Safari ثم أضفها إلى الشاشة الرئيسية لتفعيل الإشعارات.');
      setSupported(false);
      return;
    }

    if (!window.isSecureContext) {
      setUnsupportedMessage('تفعيل الإشعارات يتطلب اتصالاً آمناً عبر HTTPS.');
      setSupported(false);
      return;
    }

    if (!hasSW || !hasPush || !hasNotification) {
      setUnsupportedMessage('هذا المتصفح لا يدعم إشعارات الويب المطلوبة. افتح رابط التتبع في Chrome أو متصفح حديث يدعم الإشعارات.');
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
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('هذا المتصفح أو الاتصال الحالي لا يدعم تفعيل إشعارات الويب.');
      }

      // Resolve build-time configuration before prompting the shopper.
      const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('مفتاح VAPID العام غير مضبوط في إعدادات نشر الموقع. يرجى التواصل مع المتجر.');
      }

      // IMPORTANT: request permission before the first await so Chrome keeps
      // the click's transient user activation and can display its permission prompt.
      const permissionRequest = Notification.permission === 'default'
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
      const permission = await permissionRequest;

      if (permission !== 'granted') {
        setPermissionDenied(permission === 'denied');
        if (permission !== 'denied') {
          setStatusMessage('لم يتم منح إذن الإشعارات. اضغط على زر التفعيل واختر «سماح» لإكمال العملية.');
        }
        return;
      }

      // Register/activate the root service worker only after permission is granted.
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const registration = await navigator.serviceWorker.ready;

      // Obtain or create the device PushSubscription.
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(vapidPublicKey),
        });
      }

      // Link this device subscription to the current shipment.
      const res = await fetch(`/api/track/${trackingUuid}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(typeof data.error === 'string' ? data.error : `تعذر حفظ الاشتراك في الخادم (HTTP ${res.status}).`);
      }

      setIsSubscribed(true);
      try {
        localStorage.setItem(`push_subscribed_${trackingUuid}`, 'true');
      } catch {
        // The server association is authoritative; local storage is only a UI hint.
      }
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

  if (supported === null) return null;

  if (supported === false && isIOSBrowser) {
    return (
      <div style={{
        marginTop: '16px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-panel)',
        background: 'rgba(2, 132, 199, 0.08)',
        border: '1px solid rgba(2, 132, 199, 0.2)',
        fontSize: '12px',
        lineHeight: 1.6,
        color: '#0369a1',
        textAlign: 'right',
      }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          للتفعيل على أجهزة آيفون (iOS):
        </strong>
        اضغط زر المشاركة <span style={{ fontSize: '14px' }}>⎋</span> في متصفح Safari، ثم اختر <strong>«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong>. افتح الصفحة من الشاشة الرئيسية لتفعيل إشعارات الشحنة مباشرة.
      </div>
    );
  }

  if (supported === false) {
    return (
      <div role="status" style={{
        marginTop: '16px',
        padding: '13px 15px',
        borderRadius: 'var(--radius-panel)',
        background: 'rgba(100, 116, 139, 0.08)',
        border: '1px solid rgba(100, 116, 139, 0.18)',
        color: 'var(--ink-muted, #475569)',
        fontSize: '12px',
        lineHeight: 1.7,
      }}>
        {unsupportedMessage || 'لا يمكن تفعيل الإشعارات في هذا المتصفح.'}
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '18px',
      padding: '16px 18px',
      borderRadius: 'var(--radius-panel)',
      background: isSubscribed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 24, 19, 0.03)',
      border: `1px solid ${isSubscribed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 24, 19, 0.08)'}`,
      textAlign: 'right',
      transition: 'all 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--ink-main, #111827)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', color: isSubscribed ? '#059669' : 'currentColor' }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
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
                borderRadius: 'var(--radius-button)',
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
                borderRadius: 'var(--radius-button)',
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
              {isLoading ? (
                'جاري التفعيل...'
              ) : (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span>تفعيل إشعارات الشحنة</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {permissionDenied && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          marginTop: '10px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-button)',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '11px',
          lineHeight: 1.5,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 16px', marginTop: 1 }}>
            <path d="M12 3 21 20H3L12 3Z" />
            <path d="M12 9v4m0 3h.01" />
          </svg>
          <span>الإشعارات محظورة لهذا الموقع. من إعدادات Chrome، افتح إعدادات الموقع ثم الإشعارات، وغيّر الإذن إلى «سماح»، وبعدها أعد المحاولة.</span>
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
