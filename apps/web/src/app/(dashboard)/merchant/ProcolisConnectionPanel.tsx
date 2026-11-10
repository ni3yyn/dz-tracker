'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectProcolisIntegration,
  getProcolisIntegrationStatus,
  saveProcolisIntegration,
} from './actions';

type ProcolisStatus = {
  connected: boolean;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }) : 'لا يوجد نشاط مسجل بعد';
}

export function ProcolisConnectionPanel() {
  const [status, setStatus] = useState<ProcolisStatus | null>(null);
  const [token, setToken] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

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

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disconnecting) return;
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await saveProcolisIntegration(token, keyValue);
      if (!result.success || !result.status) throw new Error(result.error || 'تعذر ربط حساب Procolis.');
      setStatus(result.status);
      setToken('');
      setKeyValue('');
      setMessage('تم التحقق من بيانات Procolis وحفظ الاتصال. ستبدأ مزامنة أرقام التتبع المسجلة في طلباتك.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر ربط حساب Procolis.');
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (saving || disconnecting) return;
    if (!window.confirm('هل تريد إيقاف مزامنة Procolis وحذف بيانات الدخول المحفوظة؟ ستبقى الطلبات وسجلات التتبع السابقة محفوظة.')) return;
    setDisconnecting(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await disconnectProcolisIntegration();
      if (!result.success) throw new Error(result.error || 'تعذر فصل Procolis.');
      setStatus((current) => ({ ...(current || { connected: false }), connected: false, lastError: null }));
      setToken('');
      setKeyValue('');
      setMessage('تم فصل Procolis وحذف بيانات الدخول المحفوظة. بقيت الطلبات وسجلات التتبع السابقة محفوظة.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر فصل Procolis.');
      setFailed(true);
    } finally {
      setDisconnecting(false);
    }
  }

  const busy = saving || disconnecting;

  return (
    <article className="dz-int-guided-panel dz-procolis-panel">
      <div className="dz-int-guided-panel-title">
        <span className="dz-int-guided-number">P</span>
        <div>
          <h4>ربط Procolis</h4>
          <p>اتصال مستقل عن ZR Express، باستخدام Token وKey من حساب Procolis. تاجر تراك يقرأ حالات الشحنات ولا ينشئها أو يغيّرها.</p>
        </div>
      </div>

      {loading ? (
        <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>حالة الاتصال</span>
            <strong>{status?.connected ? 'متصل — المزامنة مفعّلة' : 'غير متصل'}</strong>
            {status?.connected && (
              <>
                <span>تاريخ الربط</span>
                <strong>{formatDate(status.connectedAt)}</strong>
                <span>آخر مزامنة ناجحة</span>
                <strong>{formatDate(status.lastSuccessAt)}</strong>
              </>
            )}
          </div>

          <form onSubmit={handleSave} className="dz-procolis-form">
            <div className="dz-procolis-fields">
              <div className="dz-procolis-field">
                <label className="dz-procolis-field-heading" htmlFor="dz-procolis-token">
                  <strong>Token</strong>
                  <small>رمز الوصول إلى حساب Procolis</small>
                </label>
                <span className="dz-procolis-input-shell">
                  <input
                    id="dz-procolis-token"
                    className="dz-procolis-input"
                    type={showToken ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder={status?.connected ? 'أدخل Token جديداً لتحديث الاتصال' : 'ألصق Token الخاص بحسابك'}
                    required
                    minLength={4}
                    maxLength={2048}
                    disabled={busy}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    className="dz-procolis-reveal"
                    onClick={() => setShowToken((visible) => !visible)}
                    aria-label={showToken ? 'إخفاء Token' : 'إظهار Token'}
                    aria-pressed={showToken}
                    disabled={busy}
                  >
                    {showToken ? 'إخفاء' : 'إظهار'}
                  </button>
                </span>
              </div>

              <div className="dz-procolis-field">
                <label className="dz-procolis-field-heading" htmlFor="dz-procolis-key">
                  <strong>Key</strong>
                  <small>مفتاح التحقق الخاص بحسابك</small>
                </label>
                <span className="dz-procolis-input-shell">
                  <input
                    id="dz-procolis-key"
                    className="dz-procolis-input"
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={keyValue}
                    onChange={(event) => setKeyValue(event.target.value)}
                    placeholder={status?.connected ? 'أدخل Key جديداً لتحديث الاتصال' : 'ألصق Key الخاص بحسابك'}
                    required
                    minLength={4}
                    maxLength={2048}
                    disabled={busy}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    className="dz-procolis-reveal"
                    onClick={() => setShowKey((visible) => !visible)}
                    aria-label={showKey ? 'إخفاء Key' : 'إظهار Key'}
                    aria-pressed={showKey}
                    disabled={busy}
                  >
                    {showKey ? 'إخفاء' : 'إظهار'}
                  </button>
                </span>
              </div>
            </div>

            <p className="dz-int-guided-note">يتحقق تاجر تراك من البيانات عبر واجهة Procolis قبل حفظها، ثم يخزنها مشفرة. لن تظهر المفاتيح المحفوظة في لوحة المتجر.</p>
            <button type="submit" className="dz-btn dz-procolis-submit" disabled={busy || !token.trim() || !keyValue.trim()}>
              {saving ? 'جارٍ التحقق والحفظ...' : status?.connected ? 'التحقق من البيانات وتحديث الاتصال' : 'التحقق من البيانات وربط Procolis'}
            </button>
          </form>

          <div className="dz-int-guided-meta">
            <span>نطاق المزامنة</span>
            <strong>أرقام التتبع المسجلة في طلبات تاجر تراك فقط</strong>
            <p className="dz-int-guided-note">واجهة Procolis المستخدمة هنا تقرأ الشحنة برقم تتبع محدد. لا تعرض قائمة شاملة لكل طرود حسابك؛ أضف رقم التتبع إلى الطلب أولاً حتى يتمكن تاجر تراك من متابعته.</p>
          </div>

          {status?.lastError && (
            <p className="dz-int-guided-note" role="alert" style={{ color: '#a12e27' }}>
              آخر خطأ: {status.lastError}
            </p>
          )}
          {status?.connected && (
            <button type="button" className="dz-support-copy" disabled={busy} onClick={handleDisconnect}>
              {disconnecting ? 'جارٍ فصل الاتصال...' : 'فصل Procolis وحذف بيانات الدخول'}
            </button>
          )}
        </>
      )}

      {message && (
        <p className="dz-int-guided-note" role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>
          {message}
        </p>
      )}
 
      <style jsx global>{`
        .dz-carrier-manager .dz-procolis-panel {
          width: 100%;
          min-width: 0;
          gap: 18px;
        }
        .dz-carrier-manager .dz-procolis-form {
          display: grid;
          gap: 14px;
          width: 100%;
          min-width: 0;
        }
        .dz-carrier-manager .dz-procolis-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          width: 100%;
          min-width: 0;
        }
        .dz-carrier-manager .dz-procolis-field {
          display: grid;
          align-content: start;
          gap: 8px;
          min-width: 0;
          text-align: start;
        }
        .dz-carrier-manager .dz-procolis-field-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 4px 10px;
          color: var(--ink-main);
        }
        .dz-carrier-manager .dz-procolis-field-heading strong {
          font-size: 13px;
          font-weight: 850;
          letter-spacing: .015em;
        }
        .dz-carrier-manager .dz-procolis-field-heading small {
          color: var(--ink-muted);
          font-size: 11px;
          font-weight: 500;
          line-height: 1.55;
        }
        .dz-carrier-manager .dz-procolis-input-shell {
          position: relative;
          display: block;
          width: 100%;
          min-width: 0;
          direction: ltr;
        }
        .dz-carrier-manager .dz-procolis-input {
          display: block;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          min-height: 48px;
          padding: 12px 72px 12px 14px;
          border: 0 !important;
          border-radius: 0 !important;
          outline: 0;
          background: var(--bg-surface, #fff);
          color: var(--ink-main);
          box-shadow: inset 0 0 0 1px var(--border-soft, #e2e8e0);
          font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          letter-spacing: .025em;
          text-align: left;
          direction: ltr;
          transition: background-color .18s ease, box-shadow .18s ease;
        }
        .dz-carrier-manager .dz-procolis-input::placeholder {
          color: #89958b;
          font: 500 11px/1.5 'Readex Pro', 'IBM Plex Sans Arabic', system-ui, sans-serif;
          letter-spacing: 0;
          opacity: 1;
        }
        .dz-carrier-manager .dz-procolis-input:hover:not(:disabled) {
          background: #fff;
          box-shadow: inset 0 0 0 1px #bdcbbd;
        }
        .dz-carrier-manager .dz-procolis-input:focus-visible {
          background: #fff;
          box-shadow: inset 0 0 0 1px #718b78, inset 0 -2px 0 var(--brand-primary, #294b37), 0 0 0 3px rgba(65, 107, 82, .08);
        }
        .dz-carrier-manager .dz-procolis-input:disabled {
          opacity: .58;
          cursor: wait;
        }
        .dz-carrier-manager .dz-procolis-reveal {
          position: absolute;
          top: 50%;
          right: 9px;
          min-height: 30px;
          padding: 0 8px !important;
          border: 0 !important;
          background: transparent !important;
          color: var(--ink-muted) !important;
          font: 700 10px/1 'Readex Pro', 'IBM Plex Sans Arabic', system-ui, sans-serif;
          cursor: pointer;
          transform: translateY(-50%);
          transition: color .16s ease, opacity .16s ease;
        }
        .dz-carrier-manager .dz-procolis-reveal:hover:not(:disabled) {
          color: var(--brand-primary, #294b37) !important;
          opacity: 1;
        }
        .dz-carrier-manager .dz-procolis-reveal:disabled {
          opacity: .45;
          cursor: wait;
        }
        .dz-carrier-manager .dz-procolis-submit {
          justify-self: start;
          min-width: min(100%, 280px);
          min-height: 44px;
          padding: 10px 18px !important;
        }
        @media (max-width: 640px) {
          .dz-carrier-manager .dz-procolis-fields {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }
          .dz-carrier-manager .dz-procolis-submit {
            width: 100%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .dz-carrier-manager .dz-procolis-input,
          .dz-carrier-manager .dz-procolis-reveal {
            transition-duration: .01ms !important;
          }
        }
      `}</style>
    </article>
  );
}