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
    <article className="dz-int-guided-panel">
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

          <form onSubmit={handleSave} style={{ display: 'grid', gap: 11 }}>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>Token</span>
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={status?.connected ? 'أدخل Token جديداً لتحديث بيانات الربط' : 'Token الخاص بحساب Procolis'}
                required
                minLength={4}
                maxLength={2048}
                disabled={busy}
                dir="ltr"
              />
            </label>
            <label style={{ display: 'grid', gap: 5 }}>
              <span>Key</span>
              <input
                type="password"
                autoComplete="off"
                value={keyValue}
                onChange={(event) => setKeyValue(event.target.value)}
                placeholder={status?.connected ? 'أدخل Key جديداً لتحديث بيانات الربط' : 'Key الخاص بحساب Procolis'}
                required
                minLength={4}
                maxLength={2048}
                disabled={busy}
                dir="ltr"
              />
            </label>
            <p className="dz-int-guided-note">يتحقق تاجر تراك من البيانات عبر واجهة Procolis قبل حفظها، ثم يخزنها مشفرة. لن تظهر المفاتيح المحفوظة في لوحة المتجر.</p>
            <button type="submit" className="dz-btn" disabled={busy || !token.trim() || !keyValue.trim()}>
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
    </article>
  );
}
