'use client';

import React, { useEffect, useId, useState } from 'react';
import {
  checkMaystroConnection,
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

const dateLabel = (value?: string | null) => {
  if (!value) return 'لم يصل تحديث بعد';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'تاريخ غير متاح' : date.toLocaleString('ar-DZ');
};

function validateApiToken(value: string): string {
  const token = value.trim().replace(/^Token\s+/i, '').trim();
  if (!token) return 'أدخل Store API Token أولاً.';
  if (token.length < 8) return 'الرمز قصير جداً. انسخ Store API Token كاملاً من Maystro.';
  if (token.length > 512) return 'الرمز أطول من الحد المتوقع. تأكد من نسخ Store API Token فقط.';
  if (!/^[\x21-\x7E]+$/.test(token)) {
    return 'أزل المسافات أو الأسطر الزائدة وتأكد من نسخ الرمز كما يظهر في Maystro.';
  }
  return '';
}

export function MaystroConnectionPanel() {
  const tokenInputId = useId();
  const tokenHelpId = useId();
  const tokenErrorId = useId();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [apiToken, setApiToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusLoadError, setStatusLoadError] = useState('');
  const [statusReload, setStatusReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setStatusLoadError('');

    getMaystroIntegrationStatus()
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setStatus(result.status);
          setStatusLoadError('');
        } else {
          setStatus(null);
          setStatusLoadError(result.error || 'تعذر تحميل حالة الربط.');
        }
      })
      .catch(() => {
        if (active) {
          setStatus(null);
          setStatusLoadError('تعذر تحميل حالة الربط. تحقق من اتصالك ثم أعد المحاولة.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [statusReload]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || checking || disconnecting) return;

    const validationError = validateApiToken(apiToken);
    if (validationError) {
      setTokenError(validationError);
      setMessage('');
      setMessageIsError(false);
      return;
    }

    setTokenError('');
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
      setStatusLoadError('');
      setApiToken('');
      setMessage('تم التحقق من رمز Maystro وحفظه بأمان. انسخ رابط الاستقبال أدناه وأضفه في إعدادات Webhooks لدى Maystro.');
      setMessageIsError(false);
    } catch {
      setMessage('حدث خطأ غير متوقع أثناء الربط. لم يتم تأكيد حفظ البيانات؛ أعد المحاولة.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckConnection() {
    if (checking || saving || disconnecting || !status?.connected) return;
    setChecking(true);
    setMessage('');
    setMessageIsError(false);

    try {
      const result = await checkMaystroConnection();
      if (!result.success) {
        setMessage(result.error || 'فشل اختبار الاتصال بحساب Maystro.');
        setMessageIsError(true);
        return;
      }

      setMessage('نجح اختبار الاتصال: رمز API المحفوظ ما زال صالحاً وMaystro يستجيب لطلبات القراءة.');
      setMessageIsError(false);
    } catch {
      setMessage('تعذر إكمال اختبار الاتصال. تحقق من اتصالك وحاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setChecking(false);
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
      setCopied(false);
      setMessage('تعذر النسخ تلقائياً. حدّد الرابط الظاهر وانسخه يدوياً.');
      setMessageIsError(true);
    }
  }

  async function handleDisconnect() {
    if (disconnecting || saving || checking) return;
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
      setTokenError('');
      setMessage('تم فصل حساب Maystro في تاجر تراك. احذف رابط Webhook القديم من إعدادات Maystro أيضاً حتى لا يستمر في إرسال إشعارات غير مستخدمة.');
      setMessageIsError(false);
    } catch {
      setMessage('حدث خطأ غير متوقع أثناء فصل الحساب. أعد المحاولة.');
      setMessageIsError(true);
    } finally {
      setDisconnecting(false);
    }
  }

  function handleRetryStatus() {
    setMessage('');
    setMessageIsError(false);
    setStatusLoadError('');
    setLoading(true);
    setStatusReload((current) => current + 1);
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
        <p className="dz-int-guided-note" style={{ fontSize: '15.5px', lineHeight: 1.8 }}>
          جارٍ التحقق من حالة الربط...
        </p>
      ) : statusLoadError ? (
        <div
          role="alert"
          style={{ display: 'grid', gap: '10px', padding: '12px', borderRadius: '9px', background: '#fff4f2', color: '#b42318' }}
        >
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.8 }}>{statusLoadError}</p>
          <button type="button" className="dz-support-copy" onClick={handleRetryStatus} disabled={loading}>
            إعادة التحقق من حالة الربط
          </button>
        </div>
      ) : (
        <div className="dz-int-guided-meta">
          <span>حالة الربط</span>
          <strong style={{ fontSize: '16px' }}>
            {status?.connected
              ? status.lastError
                ? 'الحساب مربوط، لكن آخر مزامنة واجهت خطأ'
                : status.lastWebhookProcessedAt
                  ? 'الحساب مربوط وتمت مزامنة طلباته'
                  : status.lastWebhookReceivedAt
                    ? 'وصل إشعار من Maystro ولم تُسجّل مزامنة ناجحة بعد'
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
      )}

      {!loading && !statusLoadError && status?.connected && (
        <div style={{ display: 'grid', gap: '10px' }}>
          <div className="dz-int-guided-copy">
            <div style={{ minWidth: 0 }}>
              <small>رابط استقبال التحديثات الخاص بمتجرك</small>
              <code dir="ltr" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{status.endpointUrl}</code>
            </div>
            <button type="button" onClick={handleCopyWebhook} disabled={!status.endpointUrl}>
              {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
            </button>
          </div>

          {status.lastError && (
            <p
              className="dz-int-guided-note"
              role="alert"
              style={{ color: '#b42318', background: '#fff4f2', borderRadius: '9px', padding: '10px 12px', fontSize: '14px', lineHeight: 1.8, overflowWrap: 'anywhere' }}
            >
              آخر خطأ في المزامنة: {status.lastError}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="dz-btn"
              disabled={checking || disconnecting || saving}
              onClick={handleCheckConnection}
            >
              {checking ? 'جارٍ اختبار الاتصال...' : 'اختبار اتصال API'}
            </button>
            <button
              type="button"
              className="dz-support-copy"
              disabled={disconnecting || checking || saving}
              onClick={handleDisconnect}
            >
              {disconnecting ? 'جارٍ فصل الحساب...' : 'فصل حساب Maystro'}
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <form onSubmit={handleSave} noValidate style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
          <h5 style={{ margin: '0', fontSize: '16px', fontWeight: 800 }}>
            {status?.connected ? 'تحديث رمز API' : 'ثانياً: أدخل رمز API هنا'}
          </h5>
          <label htmlFor={tokenInputId} style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
            <span><b dir="ltr">Store API Token</b> — رمز حساب Maystro</span>
            <small id={tokenHelpId} style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              الصق الرمز الذي نسخته من Paramètres → Info personnelles. يمكنك لصق الرمز وحده أو مع بادئة Token.
            </small>
            <input
              id={tokenInputId}
              className="input"
              type="password"
              required
              disabled={saving || checking || disconnecting}
              maxLength={518}
              value={apiToken}
              onChange={(event) => {
                const value = event.target.value;
                setApiToken(value);
                if (tokenError) setTokenError(value.trim() ? validateApiToken(value) : '');
                if (message) {
                  setMessage('');
                  setMessageIsError(false);
                }
              }}
              onBlur={() => {
                if (apiToken.trim()) setTokenError(validateApiToken(apiToken));
              }}
              placeholder={status?.connected ? 'أدخل الرمز الجديد لتحديث الربط' : 'الصق Store API Token هنا'}
              dir="ltr"
              autoComplete="new-password"
              aria-invalid={Boolean(tokenError)}
              aria-describedby={tokenError ? tokenHelpId + ' ' + tokenErrorId : tokenHelpId}
            />
            {tokenError && (
              <small id={tokenErrorId} role="alert" style={{ color: '#b42318', fontSize: '13px', lineHeight: 1.7 }}>
                {tokenError}
              </small>
            )}
          </label>
          <button type="submit" className="dz-btn" disabled={saving || checking || disconnecting}>
            {saving ? 'جارٍ التحقق من حساب Maystro...' : status?.connected ? 'حفظ الرمز وتحديث الربط' : 'تحقق من الحساب واربط Maystro'}
          </button>
        </form>
      )}

      {!loading && status?.connected && (
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

      {message && (
        <p
          className="dz-int-guided-note"
          role={messageIsError ? 'alert' : 'status'}
          aria-live={messageIsError ? 'assertive' : 'polite'}
          aria-atomic="true"
          style={messageIsError
            ? { color: '#b42318', background: '#fff4f2', borderRadius: '9px', padding: '10px 12px', fontSize: '14px', lineHeight: 1.8, overflowWrap: 'anywhere' }
            : { color: '#315f40', background: '#eef5ed', borderRadius: '9px', padding: '10px 12px', fontSize: '14px', lineHeight: 1.8 }}
        >
          {message}
        </p>
      )}
    </article>
  );
}
