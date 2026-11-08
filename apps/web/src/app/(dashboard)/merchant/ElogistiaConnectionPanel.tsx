'use client';

import React, { useEffect, useId, useState } from 'react';
import {
  checkElogistiaConnection,
  disconnectElogistiaIntegration,
  getElogistiaIntegrationStatus,
  saveElogistiaIntegration,
} from './elogistia-actions';

type Status = {
  connected: boolean;
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
};
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('ar-DZ') : 'لم تتم المزامنة بعد';

export function ElogistiaConnectionPanel() {
  const inputId = useId();
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const result = await getElogistiaIntegrationStatus();
      if (!result.success) throw new Error(result.error || 'تعذر تحميل حالة الربط.');
      setStatus(result.status as Status);
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحميل حالة الربط.');
      setIsError(true);
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || checking || disconnecting) return;
    setSaving(true); setMessage(''); setIsError(false);
    try {
      const result = await saveElogistiaIntegration(apiKey);
      if (!result.success) throw new Error(result.error || 'تعذر ربط حساب Elogistia.');
      setStatus(result.status as Status);
      setApiKey('');
      setMessage('تم التحقق من API Key وحفظه مشفراً. أصبح حساب Elogistia جاهزاً لإنشاء الشحنات ومزامنة حالاتها.');
    } catch (error: any) {
      setMessage(error?.message || 'حدث خطأ أثناء الربط.');
      setIsError(true);
    } finally { setSaving(false); }
  }

  async function check() {
    if (checking || saving || disconnecting) return;
    setChecking(true); setMessage(''); setIsError(false);
    try {
      const result = await checkElogistiaConnection();
      if (!result.success) throw new Error(result.error || 'فشل اختبار الاتصال.');
      setMessage('نجح الاختبار: Elogistia قبلت API Key وأعادت بيانات الولايات.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر اختبار الاتصال.');
      setIsError(true);
    } finally { setChecking(false); }
  }

  async function disconnect() {
    if (disconnecting || saving || checking) return;
    setDisconnecting(true); setMessage(''); setIsError(false);
    try {
      const result = await disconnectElogistiaIntegration();
      if (!result.success) throw new Error(result.error || 'تعذر فصل الحساب.');
      setStatus({ connected: false }); setApiKey('');
      setMessage('تم فصل حساب Elogistia. ستبقى الطلبات وأرقام التتبع السابقة محفوظة.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر فصل الحساب.');
      setIsError(true);
    } finally { setDisconnecting(false); }
  }

  const busy = saving || checking || disconnecting;
  return <article className="dz-int-guided-panel">
    <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">01</span><div><h4>ربط حساب Elogistia</h4><p style={{ fontSize: 16, lineHeight: 1.8 }}>اربط حسابك باستخدام API Key الخاص بك. يتحقق تاجر تراك من المفتاح ويحفظه مشفراً على الخادم.</p></div></div>
    <h5 style={{ margin: '8px 0', fontSize: 16 }}>أين أجد API Key؟</h5>
    <ol className="dz-int-guided-steps">
      <li>سجّل الدخول إلى حسابك في Elogistia.</li>
      <li>افتح إعدادات API أو قسم المطورين في حسابك.</li>
      <li>انسخ API Key الخاص بحسابك، ولا تشارك كلمة مرور حسابك.</li>
      <li>الصق المفتاح أدناه ثم اضغط «تحقق من الحساب واربط Elogistia».</li>
    </ol>
    <p className="dz-int-guided-note" style={{ fontSize: 14, lineHeight: 1.8 }}>
      ترسل Elogistia المفتاح كمعامل <code dir="ltr">key</code> أو <code dir="ltr">apiKey</code> داخل طلب API حسب نوع العملية. يحفظ تاجر تراك المفتاح مشفراً ولا يضعه في المتصفح أو سجلات الطلبات.
    </p>
    {loading ? <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p> : <>
      <div className="dz-int-guided-meta">
        <span>حالة الربط</span><strong style={{ fontSize: 16 }}>{status?.connected ? 'الحساب مربوط — إنشاء شحنات ومزامنة دورية' : 'لم يتم الربط بعد'}</strong>
        {status?.connected && <><span>آخر دورة مزامنة</span><strong>{dateLabel(status.last_sync_at)}</strong><span>آخر مزامنة ناجحة</span><strong>{dateLabel(status.last_success_at)}</strong></>}
      </div>
      {status?.connected && <>
        {status.last_error && <p role="alert" className="dz-int-guided-note" style={{ color: '#b42318', background: '#fff4f2', padding: 12, borderRadius: 9 }}>{status.last_error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="dz-btn" onClick={check} disabled={busy}>{checking ? 'جارٍ الاختبار...' : 'اختبار اتصال API'}</button>
          <button type="button" className="dz-support-copy" onClick={disconnect} disabled={busy}>{disconnecting ? 'جارٍ الفصل...' : 'فصل حساب Elogistia'}</button>
        </div>
      </>}
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <h5 style={{ margin: 0, fontSize: 16 }}>{status?.connected ? 'تحديث API Key' : 'أدخل API Key'}</h5>
        <label htmlFor={inputId} style={{ display: 'grid', gap: 7, fontSize: 16 }}>
          <span><b dir="ltr">API Key</b> — مفتاح حساب Elogistia</span>
          <input id={inputId} className="input" type="password" dir="ltr" autoComplete="new-password" maxLength={2054} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="الصق API Key هنا" disabled={busy} />
        </label>
        <button type="submit" className="dz-btn" disabled={!apiKey.trim() || busy}>{saving ? 'جارٍ التحقق والحفظ...' : status?.connected ? 'حفظ وتحديث الربط' : 'تحقق من الحساب واربط Elogistia'}</button>
      </form>
      <div style={{ marginTop: 16 }}>
        <h5 style={{ margin: '0 0 8px', fontSize: 16 }}>كيف تعمل المزامنة؟</h5>
        <p className="dz-int-guided-note" style={{ fontSize: 14, lineHeight: 1.8 }}>
          ينشئ تاجر تراك الشحنة داخل حساب Elogistia عند طلبك ذلك من تفاصيل الطلب، ثم يفحص سجل تتبع الشحنات المرتبطة دورياً كل 5 دقائق تقريباً. لا يعتمد الربط على Webhook غير موثق ولا يستورد تلقائياً شحنات أُنشئت خارج تاجر تراك.
        </p>
      </div>
    </>}
    {message && <p className="dz-int-guided-note" role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} style={isError ? { color: '#b42318', background: '#fff4f2', padding: 12, borderRadius: 9, fontSize: 14 } : { color: '#315f40', background: '#eef5ed', padding: 12, borderRadius: 9, fontSize: 14 }}>{message}</p>}
  </article>;
}
