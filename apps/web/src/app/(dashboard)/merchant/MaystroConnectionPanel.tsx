'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectMaystroIntegration,
  getMaystroIntegrationStatus,
  saveMaystroIntegration,
} from './maystro-actions';

type ConnectionStatus = {
  connected: boolean;
  endpointUrl?: string;
  connectedAt?: string | null;
  lastWebhookReceivedAt?: string | null;
  lastWebhookProcessedAt?: string | null;
  lastError?: string | null;
};

const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString('ar-DZ')
  : 'لم يصل تحديث بعد';

export function MaystroConnectionPanel() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let active = true;
    getMaystroIntegrationStatus()
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setStatus(result.status);
        } else {
          setMessage(result.error || 'تعذر تحميل حالة الربط.');
          setMessageIsError(true);
        }
      })
      .catch(() => {
        if (active) {
          setMessage('تعذر تحميل حالة الربط. حدّث الصفحة وحاول مجدداً.');
          setMessageIsError(true);
        }
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
    setMessageIsError(false);
    try {
      const result = await saveMaystroIntegration(apiToken);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر ربط حساب Maystro. راجع رمز API وحاول مجدداً.');
        setMessageIsError(true);
        return;
      }
      setStatus(result.status);
      setApiToken('');
      setMessage('تم التحقق من رمز Maystro وحفظه بأمان. انسخ رابط الاستقبال أدناه وأضفه في إعدادات Webhooks لدى Maystro.');
      setMessageIsError(false);
    } catch {
      setMessage('تعذر إكمال الربط. تحقق من رمز API ثم حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyWebhook() {
    if (!status?.endpointUrl) return;
    try {
      await navigator.clipboard.writeText(status.endpointUrl);
      setCopied(true);
      setMessage('تم نسخ رابط استقبال Maystro.');
      setMessageIsError(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('تعذر النسخ تلقائياً. حدّد الرابط وانسخه يدوياً.');
      setMessageIsError(true);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const result = await disconnectMaystroIntegration();
      if (!result.success) {
        setMessage(result.error || 'تعذر فصل حساب Maystro.');
        setMessageIsError(true);
        return;
      }
      setStatus({ connected: false });
      setApiToken('');
      setMessage('تم فصل حساب Maystro في تاجر تراك. احذف رابط Webhook القديم من إعدادات Maystro أيضاً حتى لا يستمر في إرسال إشعارات غير مستخدمة.');
      setMessageIsError(false);
    } catch {
      setMessage('تعذر فصل الحساب. حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <article className="dz-int-guided-panel">
      <div className="dz-int-guided-panel-title">
        <span className="dz-int-guided-number">01</span>
        <div>
          <h4>ربط حساب Maystro Delivery</h4>
          <p style={{ fontSize: '16px', lineHeight: 1.8 }}>
            اربط حساب متجرك مرة واحدة. سيقرأ تاجر تراك بيانات الطرود وسجل حالاتها من Maystro تلقائياً عند وصول إشعار Webhook.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '6px' }}>
        <h5 style={{ margin: '0 0 9px', fontSize: '16px', fontWeight: 800 }}>
          أولاً: أين تجد رمز API في Maystro؟
        </h5>
        <ol className="dz-int-guided-steps">
          <li>افتح تطبيق أو لوحة <strong>Maystro Delivery</strong> وسجّل الدخول إلى حساب متجرك.</li>
          <li>من القائمة، افتح <strong dir="ltr">Paramètres</strong> ثم <strong dir="ltr">Info personnelles</strong>.</li>
          <li>انسخ رمز المتجر <strong dir="ltr">Store Token / Authentication Token</strong>.</li>
          <li>ارجع إلى تاجر تراك والصق الرمز في الخانة أدناه، ثم اضغط زر التحقق والربط.</li>
        </ol>
        <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
          هذا الرمز يسمح لتاجر تراك بقراءة بيانات الطلب وسجل التوصيل من Maystro. يتم تشفيره على الخادم ولا يظهر مجدداً في المتصفح. لا ينشئ تاجر تراك طروداً جديدة ولا يعدّل طلباتك في Maystro.
        </p>
      </div>

      {loading ? (
        <p className="dz-int-guided-note" style={{ fontSize: '15.5px', lineHeight: 1.8 }}>جارٍ التحقق من حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>حالة الربط</span>
            <strong style={{ fontSize: '16px' }}>
              {status?.connected
                ? status.lastWebhookReceivedAt
                  ? 'تم التحقق من API ووصل أول Webhook'
                  : 'تم التحقق من API — بانتظار أول Webhook'
                : 'لم يتم الربط بعد'}
            </strong>
            {status?.connected && (
              <>
                <span>آخر إشعار وصل من Maystro</span>
                <strong>{dateLabel(status.lastWebhookReceivedAt)}</strong>
                <span>آخر مزامنة ناجحة للطلب وسجل حالاته</span>
                <strong>{dateLabel(status.lastWebhookProcessedAt)}</strong>
              </>
            )}
          </div>

          {status?.connected && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div className="dz-int-guided-copy">
                <div style={{ minWidth: 0 }}>
                  <small>رابط استقبال التحديثات الخاص بمتجرك</small>
                  <code dir="ltr" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{status.endpointUrl}</code>
                </div>
                <button type="button" onClick={handleCopyWebhook}>
                  {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
                </button>
              </div>
              {status.lastError && (
                <p className="dz-int-guided-note" style={{ color: '#b42318', fontSize: '14px' }}>
                  آخر خطأ في المزامنة: {status.lastError}
                </p>
              )}
              <button
                type="button"
                className="dz-support-copy"
                disabled={disconnecting}
                onClick={handleDisconnect}
              >
                {disconnecting ? 'جارٍ فصل الحساب...' : 'فصل حساب Maystro'}
              </button>
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            <h5 style={{ margin: '0', fontSize: '16px', fontWeight: 800 }}>
              {status?.connected ? 'تحديث رمز API' : 'ثانياً: أدخل رمز API هنا'}
            </h5>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span><b dir="ltr">Store API Token</b> — رمز حساب Maystro</span>
              <small style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                الصق الرمز الذي نسخته من Paramètres → Info personnelles.
              </small>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                maxLength={512}
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder={status?.connected ? 'أدخل الرمز الجديد لتحديث الربط' : 'الصق Store API Token هنا'}
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="dz-btn" disabled={saving || !apiToken.trim()}>
              {saving ? 'جارٍ التحقق من حساب Maystro...' : status?.connected ? 'حفظ الرمز وتحديث الربط' : 'تحقق من الحساب واربط Maystro'}
            </button>
          </form>

          {status?.connected && (
            <div style={{ marginTop: '18px' }}>
              <h5 style={{ margin: '0 0 9px', fontSize: '16px', fontWeight: 800 }}>
                ثالثاً: فعّل إرسال إشعارات Maystro إلى تاجر تراك
              </h5>
              <ol className="dz-int-guided-steps">
                <li>افتح Maystro ثم <strong dir="ltr">Paramètres → Webhooks</strong>.</li>
                <li>أنشئ Webhook جديداً، والصق رابط الاستقبال المنسوخ أعلاه في خانة الرابط.</li>
                <li>ضمن <strong dir="ltr">Sélectionnez des événements</strong> اختر <strong dir="ltr">DeliveryInfoUpdated</strong> و<strong dir="ltr">OrderFieldUpdated</strong> و<strong dir="ltr">OrderDelivered</strong>.</li>
                <li>احفظ الإعدادات. أرسل حدث <strong dir="ltr">test</strong> للتأكد من وصول الاتصال، ثم جرّب تغيير حالة طرد فعلي.</li>
              </ol>
              <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
                لا تحتاج إلى اختيار <strong dir="ltr">all</strong>. حدث <strong dir="ltr">DeliveryInfoUpdated</strong> يحافظ على تحديث الولاية والبلدية والعنوان وتفاصيل التوصيل، بينما يتابع <strong dir="ltr">OrderFieldUpdated</strong> تغييرات الطلب، ويؤكد <strong dir="ltr">OrderDelivered</strong> التسليم. يسترجع تاجر تراك بيانات العميل والمنتجات وسجل الحالات مباشرة من API عند كل إشعار.
              </p>
            </div>
          )}
        </>
      )}

      {message && (
        <p
          className="dz-int-guided-note"
          role="status"
          aria-live="polite"
          style={messageIsError
            ? { color: '#b42318', background: '#fff4f2', borderRadius: '9px', padding: '10px 12px', fontSize: '14px', lineHeight: 1.8 }
            : { fontSize: '14px', lineHeight: 1.8 }}
        >
          {message}
        </p>
      )}
    </article>
  );
}
