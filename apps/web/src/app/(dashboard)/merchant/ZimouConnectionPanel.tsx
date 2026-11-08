'use client';
import React, { useEffect, useId, useState } from 'react';
import { checkZimouConnection, disconnectZimouIntegration, getZimouIntegrationStatus, saveZimouIntegration } from './zimou-actions';
type Status = { connected: boolean; connected_at?: string | null; last_sync_at?: string | null; last_success_at?: string | null; last_error?: string | null };
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('ar-DZ') : 'لم تتم المزامنة بعد';
export function ZimouConnectionPanel() {
  const inputId = useId(); const [status,setStatus] = useState<Status|null>(null); const [token,setToken] = useState('');
  const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [checking,setChecking] = useState(false);
  const [disconnecting,setDisconnecting] = useState(false); const [message,setMessage] = useState(''); const [isError,setIsError] = useState(false);
  async function refresh() {
    setLoading(true);
    try { const result = await getZimouIntegrationStatus(); if (!result.success) throw new Error(result.error || 'تعذر تحميل حالة الربط.'); setStatus(result.status as Status); }
    catch (error: any) { setMessage(error?.message || 'تعذر تحميل حالة الربط.'); setIsError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || checking || disconnecting) return;
    setSaving(true); setMessage(''); setIsError(false);
    try { const result = await saveZimouIntegration(token); if (!result.success) throw new Error(result.error || 'تعذر ربط حساب Zimou.');
      setStatus(result.status as Status); setToken(''); setMessage('تم التحقق من API Token وحفظه مشفراً. سيبدأ تاجر تراك بمزامنة أرقام التتبع الموجودة لديه.'); }
    catch (error: any) { setMessage(error?.message || 'حدث خطأ أثناء الربط.'); setIsError(true); }
    finally { setSaving(false); }
  }
  async function check() {
    if (checking || saving || disconnecting) return; setChecking(true); setMessage(''); setIsError(false);
    try { const result = await checkZimouConnection(); if (!result.success) throw new Error(result.error || 'فشل اختبار الاتصال.'); setMessage('نجح الاختبار: Zimou قبل الرمز وأعاد بيانات الحساب.'); }
    catch (error: any) { setMessage(error?.message || 'تعذر اختبار الاتصال.'); setIsError(true); }
    finally { setChecking(false); }
  }
  async function disconnect() {
    if (disconnecting || saving || checking) return; setDisconnecting(true); setMessage(''); setIsError(false);
    try { const result = await disconnectZimouIntegration(); if (!result.success) throw new Error(result.error || 'تعذر فصل الحساب.'); setStatus({ connected: false }); setToken(''); setMessage('تم فصل حساب Zimou. ستبقى الطلبات وسجلات التتبع السابقة محفوظة.'); }
    catch (error: any) { setMessage(error?.message || 'تعذر فصل الحساب.'); setIsError(true); }
    finally { setDisconnecting(false); }
  }
  return <article className="dz-int-guided-panel">
    <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">01</span><div><h4>ربط حساب Zimou Express</h4><p style={{fontSize:16,lineHeight:1.8}}>اربط حسابك باستخدام API Token. يتحقق تاجر تراك من الحساب ويحفظ الرمز مشفراً على الخادم.</p></div></div>
    <h5 style={{margin:'8px 0',fontSize:16}}>أولاً: أحضر API Token من حساب Zimou</h5>
    <ol className="dz-int-guided-steps"><li>سجّل الدخول إلى حسابك في منصة Zimou Express.</li><li>افتح قسم API أو إعدادات المطورين في لوحة حسابك.</li><li>انسخ API Token الخاص بحسابك.</li><li>الصق الرمز أدناه ثم اضغط «تحقق من الحساب واربط Zimou».</li></ol>
    <p className="dz-int-guided-note" style={{fontSize:14,lineHeight:1.8}}>يستخدم الربط واجهة Zimou مباشرة عبر Authorization: Bearer. لا نطلب بيانات Feeef ولا نرسل بياناتك إلى خدمة وسيطة.</p>
    {loading ? <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p> : <>
      <div className="dz-int-guided-meta"><span>حالة الربط</span><strong style={{fontSize:16}}>{status?.connected ? 'الحساب مربوط — مزامنة دورية لأرقام التتبع المسجلة' : 'لم يتم الربط بعد'}</strong>
      {status?.connected && <><span>آخر دورة مزامنة</span><strong>{dateLabel(status.last_sync_at)}</strong><span>آخر مزامنة ناجحة</span><strong>{dateLabel(status.last_success_at)}</strong></>}</div>
      {status?.connected && <>{status.last_error && <p role="alert" className="dz-int-guided-note" style={{color:'#b42318',background:'#fff4f2',padding:12,borderRadius:9}}>{status.last_error}</p>}
      <div style={{display:'flex',flexWrap:'wrap',gap:10}}><button type="button" className="dz-btn" onClick={check} disabled={checking||saving||disconnecting}>{checking?'جارٍ الاختبار...':'اختبار اتصال API'}</button><button type="button" className="dz-support-copy" onClick={disconnect} disabled={disconnecting||checking||saving}>{disconnecting?'جارٍ الفصل...':'فصل حساب Zimou'}</button></div></>}
      <form onSubmit={save} noValidate style={{display:'grid',gap:12,marginTop:16}}><h5 style={{margin:0,fontSize:16}}>{status?.connected?'تحديث API Token':'ثانياً: أدخل API Token'}</h5>
      <label htmlFor={inputId} style={{display:'grid',gap:7,fontSize:16}}><span><b dir="ltr">API Token</b> — رمز حساب Zimou</span><small style={{color:'var(--ink-muted)',fontSize:13}}>الصق الرمز وحده أو مع بادئة Bearer.</small>
      <input id={inputId} className="input" type="password" dir="ltr" autoComplete="new-password" maxLength={2054} value={token} onChange={e=>setToken(e.target.value)} placeholder="الصق API Token هنا" disabled={saving||checking||disconnecting}/></label>
      <button type="submit" className="dz-btn" disabled={!token.trim()||saving||checking||disconnecting}>{saving?'جارٍ التحقق والحفظ...':status?.connected?'حفظ وتحديث الربط':'تحقق من الحساب واربط Zimou'}</button></form>
      <div style={{marginTop:16}}><h5 style={{margin:'0 0 8px',fontSize:16}}>كيف تتم مزامنة الشحنات؟</h5><p className="dz-int-guided-note" style={{fontSize:14,lineHeight:1.8}}>لا نعتمد على Webhook أصلي غير موثّق. يفحص العامل الخلفي أرقام تتبع Zimou الموجودة مسبقاً في طلبات متجرك على دفعات، ثم يحدّث الحالة وبيانات شركة التوصيل الشريكة كل 5 دقائق تقريباً. لا يستورد هذا المسار طروداً جديدة لا يملك تاجر تراك رقم تتبعها، ولا ينشئ أو يلغي أي طرد.</p></div>
    </>}
    {message && <p className="dz-int-guided-note" role={isError?'alert':'status'} aria-live={isError?'assertive':'polite'} style={isError?{color:'#b42318',background:'#fff4f2',padding:12,borderRadius:9,fontSize:14}:{color:'#315f40',background:'#eef5ed',padding:12,borderRadius:9,fontSize:14}}>{message}</p>}
  </article>;
}
