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
  : 'لم يصل تحديث بعد';

export function ZRExpressConnectionPanel() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let active = true;
    getZRExpressIntegrationStatus()
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
      const result = await saveZRExpressIntegration(apiKey, tenantId);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر ربط حساب ZR Express. راجع البيانات وحاول مجدداً.');
        setMessageIsError(true);
        return;
      }
      setStatus(result.status);
      setApiKey('');
      setTenantId('');
      setMessage('تم ربط حسابك بنجاح! سيستقبل تاجر تراك تحديثات الشحن تلقائياً، ولا تحتاج إلى أي إعداد إضافي داخل ZR Express.');
      setMessageIsError(false);
    } catch {
      setMessage('تعذر إكمال الربط. تأكد من نسخ البيانات كاملة من حساب ZR Express ثم حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const result = await disconnectZRExpressIntegration();
      if (!result.success) {
        setMessage(result.error || 'تعذر فصل حساب ZR Express.');
        setMessageIsError(true);
        return;
      }
      setStatus({ connected: false });
      setApiKey('');
      setTenantId('');
      setMessage('تم فصل حساب ZR Express. ستبقى طلباتك وسجلات التتبع السابقة محفوظة.');
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
          <h4>ربط شركة التوصيل ZR Express</h4>
          <p style={{ fontSize: '16px', lineHeight: 1.8 }}>
            اتبع الخطوات التالية لإحضار بيانات حسابك. أدخلها هنا، وسيتولى تاجر تراك إكمال الربط واستقبال تحديثات الشحن تلقائياً.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '6px' }}>
        <h5 style={{ margin: '0 0 9px', fontSize: '16px', fontWeight: 800 }}>أولاً: أين تجد البيانات في حساب ZR Express؟</h5>
        <ol className="dz-int-guided-steps">
          <li>افتح حسابك في منصة <strong>ZR Express</strong> وسجّل الدخول.</li>
          <li>من القائمة، افتح <strong dir="ltr">API Rest</strong> ثم اختر <strong dir="ltr">Token API</strong>.</li>
          <li>في هذه الصفحة، انسخ قيمة <strong dir="ltr">API Key</strong>، ثم انسخ قيمة <strong dir="ltr">Tenant ID</strong>.</li>
          <li>ارجع إلى تاجر تراك والصق كل قيمة في الخانة التي تحمل الاسم نفسه أدناه.</li>
        </ol>
        <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
          احتفظ بهذه البيانات لنفسك ولا ترسلها لأي شخص. لا تحتاج إلى إنشاء رابط استقبال أو ضبط إعدادات الإشعارات داخل ZR Express؛ سنقوم بذلك تلقائياً بعد التحقق من حسابك.
        </p>
      </div>

      {loading ? (
        <p className="dz-int-guided-note" style={{ fontSize: '15.5px', lineHeight: 1.8 }}>جارٍ التحقق من حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>حالة الربط</span>
            <strong style={{ fontSize: '16px' }}>{status?.connected ? 'الحساب متصل' : 'لم يتم الربط بعد'}</strong>
            {status?.connected && (
              <>
                <span>آخر تحديث وصل من ZR Express</span>
                <strong>{formatDate(status.lastWebhookReceivedAt)}</strong>
                <span>آخر تحديث تمت إضافته إلى سجل الشحنة</span>
                <strong>{formatDate(status.lastWebhookProcessedAt)}</strong>
              </>
            )}
          </div>

          {status?.connected && (
            <div style={{ display: 'grid', gap: '8px' }}>
              <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
                حسابك مرتبط. عند تغيير حالة الشحنة لدى ZR Express، سيصل التحديث إلى صفحة التتبع في تاجر تراك تلقائياً.
              </p>
              <button
                type="button"
                className="dz-support-copy"
                disabled={disconnecting}
                onClick={handleDisconnect}
              >
                {disconnecting ? 'جارٍ فصل الحساب...' : 'فصل حساب ZR Express'}
              </button>
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            <h5 style={{ margin: '0', fontSize: '16px', fontWeight: 800 }}>
              {status?.connected ? 'تحديث بيانات الربط' : 'ثانياً: أدخل البيانات هنا'}
            </h5>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span><b dir="ltr">API Key</b> — مفتاح API</span>
              <small style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                الصق المفتاح الذي نسخته من صفحة Token API في حساب ZR Express.
              </small>
              <input
                className="input"
                type="password"
                required
                minLength={16}
                maxLength={512}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="الصق API Key هنا"
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span><b dir="ltr">Tenant ID</b> — معرّف Tenant</span>
              <small style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                الصق المعرّف الموجود في الصفحة نفسها. لا تضع البريد الإلكتروني أو رقم الهاتف مكانه.
              </small>
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
            <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
              بعد الضغط على زر الربط، سيتحقق تاجر تراك من البيانات ويحفظها بشكل آمن، ثم يجهّز استقبال تحديثات الشحن نيابة عنك. لن تحتاج إلى نسخ أي رابط أو إدخال بيانات أخرى في ZR Express.
            </p>
            <button type="submit" className="dz-btn" disabled={saving || !apiKey.trim() || !tenantId.trim()}>
              {saving ? 'جارٍ التحقق من الحساب...' : status?.connected ? 'حفظ وتحديث الربط' : 'تحقق من الحساب واربط ZR Express'}
            </button>
          </form>
        </>
      )}
      {message && (
        <p
          className="dz-int-guided-note"
          role="status"
          aria-live="polite"
          style={messageIsError ? { color: '#b42318', background: '#fff4f2', borderRadius: '9px', padding: '10px 12px' } : { fontSize: '14px', lineHeight: 1.8 }}
        >
          {message}
        </p>
      )}
    </article>
  );
}
