'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectEcoTrackIntegration,
  getEcoTrackIntegrationStatus,
  saveEcoTrackIntegration,
} from './actions';

type ConnectionStatus = {
  connected: boolean;
  baseUrl?: string;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
};

export function EcoTrackConnectionPanel() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getEcoTrackIntegrationStatus()
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setStatus(result.status);
          setBaseUrl(result.status.baseUrl || '');
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
      const result = await saveEcoTrackIntegration(baseUrl, token);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر ربط حساب EcoTrack.');
        return;
      }
      setStatus(result.status);
      setBaseUrl(result.status.baseUrl || baseUrl);
      setToken('');
      setMessage('تم التحقق من بيانات EcoTrack وحفظ الربط بنجاح. سيبدأ اكتشاف الشحنات تلقائياً.');
    } catch {
      setMessage('تعذر إكمال الربط. تحقق من الاتصال ثم حاول مجدداً.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setMessage('');
    try {
      const result = await disconnectEcoTrackIntegration();
      if (!result.success) {
        setMessage(result.error || 'تعذر إلغاء الربط.');
        return;
      }
      setStatus({ connected: false });
      setToken('');
      setMessage('تم إلغاء ربط حساب EcoTrack. ستبقى الطلبات المستوردة وسجل تتبعها محفوظة.');
    } catch {
      setMessage('تعذر إلغاء الربط. حاول مجدداً.');
    } finally {
      setDisconnecting(false);
    }
  }

  const dateLabel = (value?: string | null) => value
    ? new Date(value).toLocaleString('ar-DZ')
    : 'لم تتم المزامنة بعد';

  return (
    <article className="dz-int-guided-panel">
      <div className="dz-int-guided-panel-title">
        <span className="dz-int-guided-number">02</span>
        <div>
          <h4>ربط حساب EcoTrack مباشرة</h4>
          <p>لا يحتاج هذا الربط إلى Webhook. يستخدم تاجر تراك صلاحية القراءة لاكتشاف الشحنات التي تنشئها من لوحة شركة التوصيل ومتابعة حالاتها تلقائياً كل 5 دقائق.</p>
        </div>
      </div>

      {loading ? (
        <p className="dz-int-guided-note">جارٍ التحقق من حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>حالة الحساب</span>
            <strong>{status?.connected ? 'متصل' : 'غير متصل'}</strong>
            {status?.connected && <>
              <span>آخر مزامنة ناجحة</span>
              <strong>{dateLabel(status.lastSuccessAt)}</strong>
            </>}
          </div>
          {status?.connected && (
            <div className="dz-int-guided-copy">
              <div>
                <small>عنوان API المرتبط</small>
                <code dir="ltr">{status.baseUrl}</code>
              </div>
              <button type="button" className="dz-support-copy" disabled={disconnecting} onClick={handleDisconnect}>
                {disconnecting ? 'جارٍ إلغاء الربط...' : 'إلغاء الربط'}
              </button>
            </div>
          )}
          {status?.connected && (
            <p className="dz-int-guided-note">
              آخر محاولة مزامنة: {dateLabel(status.lastSyncAt)}.
              {status.lastError ? ` آخر خطأ: ${status.lastError}` : ''}
            </p>
          )}
          <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            <label style={{ display: 'grid', gap: '7px' }}>
              <span>رابط شركة EcoTrack (Company URL)</span>
              <input
                className="input"
                type="url"
                required
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://your-company.ecotrack.dz"
                dir="ltr"
                autoComplete="url"
              />
            </label>
            <label style={{ display: 'grid', gap: '7px' }}>
              <span>Access Token</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={status?.connected ? 'أدخل الرمز لتحديث بيانات الربط' : 'ألصق الرمز الذي زودتك به شركة التوصيل'}
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <p className="dz-int-guided-note">اطلب رابط API ورمز الوصول من شركة التوصيل. يتم تشفير الرمز على الخادم، ولا يظهر مجدداً في لوحة التحكم أو في المتصفح. لا ينشئ تاجر تراك شحنات ولا يعدّلها في حساب شركة التوصيل.</p>
            <button type="submit" className="dz-btn" disabled={saving || !baseUrl.trim() || !token.trim()}>
              {saving ? 'جارٍ اختبار الاتصال وحفظه...' : status?.connected ? 'تحديث بيانات الربط' : 'اختبار الاتصال وحفظ الربط'}
            </button>
          </form>
        </>
      )}
      {message && <p className="dz-int-guided-note" role="status" aria-live="polite">{message}</p>}
    </article>
  );
}
