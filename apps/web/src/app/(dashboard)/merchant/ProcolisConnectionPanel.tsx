'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectProcolisIntegration,
  getProcolisIntegrationStatus,
  saveProcolisIntegration,
} from './actions';

type ProcolisStatus = {
  connected: boolean;
  webhookToken?: string | null;
  lastWebhookReceivedAt?: string | null;
  lastWebhookProcessedAt?: string | null;
  lastError?: string | null;
};

type Props = { siteUrl: string };

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('ar-DZ') : 'لم يصل أي إشعار بعد';
}

export function ProcolisConnectionPanel({ siteUrl }: Props) {
  const [status, setStatus] = useState<ProcolisStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const result = await getProcolisIntegrationStatus();
      if (!result.success) throw new Error(result.error || 'تعذر تحميل حالة Procolis.');
      setStatus(result.status);
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحميل حالة Procolis.');
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const endpointUrl = status?.webhookToken
    ? `${siteUrl.replace(/\\/$/, '')}/api/webhooks/procolis?token=${encodeURIComponent(status.webhookToken)}`
    : '';

  async function handleConnect() {
    if (saving || disconnecting) return;
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await saveProcolisIntegration();
      if (!result.success) throw new Error(result.error || 'تعذر تجهيز رابط Procolis.');
      setStatus(result.status);
      setMessage('تم تجهيز نقطة استقبال مستقلة لـ Procolis. أضف الرابط في لوحة الشركة لاختبار وصول التحديثات.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تجهيز رابط Procolis.');
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (saving || disconnecting) return;
    if (!window.confirm('هل عطّلت Webhook الخاص بتاجر تراك من لوحة Procolis؟ سيؤدي ذلك إلى إيقاف استقبال التحديثات لهذا الاتصال.')) return;
    setDisconnecting(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await disconnectProcolisIntegration();
      if (!result.success) throw new Error(result.error || 'تعذر فصل Procolis.');
      setStatus({ connected: false, webhookToken: null });
      setMessage('تم إيقاف اتصال Procolis في تاجر تراك. بقيت الطلبات وسجلات التتبع السابقة محفوظة.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر فصل Procolis.');
      setFailed(true);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleCopy() {
    if (!endpointUrl) return;
    try {
      await navigator.clipboard.writeText(endpointUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage('تعذر النسخ تلقائياً. حدّد الرابط وانسخه يدوياً.');
      setFailed(true);
    }
  }

  const busy = saving || disconnecting;

  return (
    <article className="dz-int-guided-panel">
      <div className="dz-int-guided-panel-title">
        <span className="dz-int-guided-number">P</span>
        <div>
          <h4>ربط Procolis</h4>
          <p>اتصال مستقل عن ZR Express. يستقبل تاجر تراك تحديثات الشحنات التي تنشئها من حساب Procolis، ولا ينشئ شحنات أو يغيّرها.</p>
        </div>
      </div>

      {loading ? (
        <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>حالة الاتصال</span>
            <strong>{status?.connected ? 'اتصال Procolis مفعّل' : 'لم يتم تفعيل الاتصال'}</strong>
            {status?.connected && (
              <>
                <span>آخر إشعار وصل</span>
                <strong>{formatDate(status.lastWebhookReceivedAt)}</strong>
                <span>آخر إشعار تمت معالجته</span>
                <strong>{formatDate(status.lastWebhookProcessedAt)}</strong>
              </>
            )}
          </div>

          {status?.connected && endpointUrl ? (
            <>
              <div className="dz-int-guided-copy">
                <div>
                  <small>رابط استقبال Procolis الخاص بهذا المتجر</small>
                  <code dir="ltr">{endpointUrl}</code>
                </div>
                <button type="button" onClick={handleCopy}>{copied ? 'تم النسخ' : 'نسخ الرابط'}</button>
              </div>
              <ol className="dz-int-guided-steps">
                <li>افتح إعدادات Webhooks في حساب Procolis.</li>
                <li>أضف الرابط أعلاه كعنوان استقبال لأحداث الشحنات.</li>
                <li>فعّل أحداث إنشاء الشحنة وتحديث حالتها، ثم أرسل حدثاً تجريبياً.</li>
                <li>ارجع إلى تاجر تراك وحدّث القائمة للتحقق من وصول النشاط.</li>
              </ol>
              <p className="dz-int-guided-note">هذا الرابط خاص باتصال Procolis وحده. لا تستخدم رابط ZR Express أو مفتاح API العام. احتفظ بالرابط داخل إعدادات الشركة فقط.</p>
              {status.lastError && <p className="dz-int-guided-note" role="alert" style={{ color: '#a12e27' }}>آخر خطأ: {status.lastError}</p>}
              <button type="button" className="dz-support-copy" disabled={busy} onClick={handleDisconnect}>
                {disconnecting ? 'جارٍ إيقاف الاتصال...' : 'إيقاف اتصال Procolis'}
              </button>
            </>
          ) : (
            <>
              <p className="dz-int-guided-note">سينشئ تاجر تراك رمز استقبال عشوائياً خاصاً بهذا المتجر وبهذا المزود. لن يتأثر اتصال ZR Express أو أي شركة أخرى.</p>
              <button type="button" className="dz-btn" disabled={busy} onClick={handleConnect}>
                {saving ? 'جارٍ تجهيز الاتصال...' : 'تجهيز رابط استقبال Procolis'}
              </button>
            </>
          )}
        </>
      )}

      {message && (
        <p className="dz-int-guided-note" role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>
          {message}
        </p>
      )}
    </article>
  );
}
