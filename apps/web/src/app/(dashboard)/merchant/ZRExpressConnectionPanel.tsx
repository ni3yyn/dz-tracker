'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectZRExpressIntegration,
  getZRExpressIntegrationStatus,
  saveZRExpressIntegration,
} from './zrexpress-actions';

type ConnectionStatus = {
  connected: boolean;
  endpointUrl?: string;
  connectedAt?: string | null;
  lastWebhookReceivedAt?: string | null;
  lastWebhookProcessedAt?: string | null;
  lastError?: string | null;
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ar-DZ')
  : 'لم يصل أي حدث بعد';

export function ZRExpressConnectionPanel() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getZRExpressIntegrationStatus()
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setStatus(result.status);
        } else {
          setMessage(result.error || 'تعذر تحميل حالة الربط.');
        }
      })
      .catch(() => {
        if (active) setMessage('تعذر تحميل حالة الربط. حدّث الصفحة وحاول مجدداً.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const result = await saveZRExpressIntegration(apiKey, tenantId);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر ربط حساب ZR Express.');
        return;
      }
      setStatus(result.status);
      setApiKey('');
      setTenantId('');
      setMessage('تم التحقق من حساب ZR Express وإنشاء Webhook آمن بنجاح. ستصل تحديثات الشحن تلقائياً.');
    } catch {
      setMessage('تعذر إكمال الربط. تحقق من البيانات والاتصال ثم حاول مجدداً.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setMessage('');
    try {
      const result = await disconnectZRExpressIntegration();
      if (!result.success) {
        setMessage(result.error || 'تعذر إلغاء الربط.');
        return;
      }
      setStatus({ connected: false });
      setApiKey('');
      setTenantId('');
      setMessage('تم حذف نقطة Webhook وإلغاء ربط ZR Express. ستبقى الطلبات وسجل التتبع الحالي محفوظين.');
    } catch {
      setMessage('تعذر إلغاء الربط. حاول مجدداً.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyEndpoint() {
    if (!status?.endpointUrl) return;
    try {
      await navigator.clipboard.writeText(status.endpointUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('تعذر نسخ الرابط. حدده وانسخه يدوياً.');
    }
  }

  return (
    <article className="dz-int-guided-panel">
      <div className="dz-int-guided-panel-title">
        <span className="dz-int-guided-number">02</span>
        <div>
          <h4>ربط حساب ZR Express مباشرة</h4>
          <p style={{ fontSize: '16px', lineHeight: 1.8 }}>
            ينشئ تاجر تراك Webhook داخل حساب ZR Express تلقائياً، ويتحقق من توقيع Svix لكل إشعار قبل قبول تحديث الشحنة.
            لا تحتاج إلى إنشاء رابط Webhook يدوياً أو لصق مفتاح توقيع.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="dz-int-guided-note" style={{ fontSize: '15.5px', lineHeight: 1.8 }}>جارٍ التحقق من حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>حالة الحساب</span>
            <strong style={{ fontSize: '16px' }}>{status?.connected ? 'متصل' : 'غير متصل'}</strong>
            {status?.connected && (
              <>
                <span>آخر إشعار وصل</span>
                <strong>{formatDate(status.lastWebhookReceivedAt)}</strong>
                <span>آخر إشعار تمت معالجته</span>
                <strong>{formatDate(status.lastWebhookProcessedAt)}</strong>
              </>
            )}
          </div>

          {status?.connected && status.endpointUrl && (
            <div className="dz-int-guided-copy">
              <div>
                <small>رابط الاستقبال المسجل لدى ZR Express</small>
                <code dir="ltr">{status.endpointUrl}</code>
              </div>
              <button type="button" className="dz-support-copy" onClick={copyEndpoint}>
                {copied ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
            </div>
          )}

          {status?.connected && (
            <>
              <p className="dz-int-guided-note">
                يتلقى تاجر تراك حالات الشحنة، وتفاصيل الـ situations، وتغيّرات مسار الإرجاع.
                {status.lastError ? ` آخر خطأ: ${status.lastError}` : ''}
              </p>
              <button
                type="button"
                className="dz-support-copy"
                disabled={disconnecting}
                onClick={handleDisconnect}
              >
                {disconnecting ? 'جارٍ إلغاء الربط...' : 'إلغاء الربط وحذف Webhook'}
              </button>
            </>
          )}

          <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span>ZR Express API Key</span>
              <input
                className="input"
                type="password"
                required
                minLength={32}
                maxLength={128}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={status?.connected ? 'أدخل المفتاح لتحديث الربط' : 'ألصق مفتاح API من حساب ZR Express'}
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span>Tenant ID</span>
              <input
                className="input"
                type="text"
                required
                minLength={36}
                maxLength={36}
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                dir="ltr"
                autoComplete="off"
              />
            </label>
            <p className="dz-int-guided-note">
              يتم إنشاء نقطة Webhook والاشتراك في الأحداث الثلاثة تلقائياً. يُشفّر مفتاح API ومعرّف Tenant
              ومفتاح توقيع Svix على الخادم ولا تُرسل إلى المتصفح بعد الحفظ. لا ينشئ تاجر تراك شحنات ولا
              يغيّر بياناتها في حساب ZR Express.
            </p>
            <button type="submit" className="dz-btn" disabled={saving || !apiKey.trim() || !tenantId.trim()}>
              {saving ? 'جارٍ التحقق وإنشاء Webhook...' : status?.connected ? 'تحديث بيانات الربط' : 'اختبار الحساب وربط ZR Express'}
            </button>
          </form>
        </>
      )}
      {message && <p className="dz-int-guided-note" role="status" aria-live="polite">{message}</p>}
    </article>
  );
}
