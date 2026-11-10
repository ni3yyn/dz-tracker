'use client';

import React, { useEffect, useState } from 'react';
import { disconnectEcomV2Integration, getEcomV2Status, saveEcomV2Integration, testEcomV2Connection } from './ecom-v2-actions';

type Status = { connected: boolean; last_sync_at?: string | null; last_success_at?: string | null; last_error?: string | null };
export function EcomV2ConnectionPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function refresh() {
    setLoading(true);
    const result = await getEcomV2Status();
    if (result.success) setStatus(result.status as Status);
    else { setMessage(result.error || 'تعذر تحميل حالة الربط.'); setFailed(true); }
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const result = await saveEcomV2Integration(key, token);
      if (!result.success) throw new Error(result.error || 'تعذر ربط الحساب.');
      setStatus(result.status as Status); setKey(''); setToken('');
      setMessage('تم التحقق من KEY وToken وحفظهما مشفرين. أصبح الاتصال جاهزاً لمزامنة بيانات الشحنات وحالاتها.');
    } catch (e: any) { setMessage(e?.message || 'تعذر ربط الحساب.'); setFailed(true); }
    finally { setBusy(false); }
  }
  async function test() {
    if (busy) return; setBusy(true); setMessage(''); setFailed(false);
    try { const result = await testEcomV2Connection(); if (!result.success) throw new Error(result.error); setMessage('نجح الاختبار: قبلت E-com Delivery بيانات الربط وأعادت قائمة الولايات.'); }
    catch (e: any) { setMessage(e?.message || 'فشل اختبار الاتصال.'); setFailed(true); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (busy) return; setBusy(true); setMessage(''); setFailed(false);
    try { const result = await disconnectEcomV2Integration(); if (!result.success) throw new Error(result.error); setStatus({ connected: false }); setMessage('تم فصل الحساب. ستبقى الطلبات وأرقام التتبع السابقة محفوظة.'); }
    catch (e: any) { setMessage(e?.message || 'تعذر فصل الحساب.'); setFailed(true); }
    finally { setBusy(false); }
  }
  return <article className="dz-int-guided-panel">
    <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">EC</span><div><h4>ربط E-com Delivery v2</h4><p style={{fontSize:16,lineHeight:1.8}}>اربط KEY وToken من صفحة «Développement / التطوير». يستخدم تاجر تراك واجهة القراءة لمتابعة الشحنات الموجودة ومزامنة حالاتها، ولا ينشئ شحنات نيابة عنك.</p></div></div>
    {loading ? <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p> : status?.connected ? <>
      <div className="dz-int-guided-meta"><span>الحالة</span><strong>الحساب متصل</strong><span>آخر مزامنة</span><strong>{status.last_sync_at ? new Date(status.last_sync_at).toLocaleString('ar-DZ') : 'بانتظار أول دورة مزامنة'}</strong></div>
      <div className="dz-int-guided-actions"><button type="button" className="dz-btn" disabled={busy} onClick={test}>{busy ? 'جارٍ الاختبار...' : 'اختبار الاتصال'}</button><button type="button" className="dz-btn dz-btn-outline" disabled={busy} onClick={disconnect}>فصل الحساب</button></div>
      {status.last_error && <p className="dz-int-guided-note" role="status">آخر خطأ مزامنة: {status.last_error}</p>}
    </> : <form onSubmit={connect} style={{display:'grid',gap:12}}>
      <label style={{display:'grid',gap:6}}>KEY <input className="dz-input-field" dir="ltr" autoComplete="off" type="password" value={key} onChange={e=>setKey(e.target.value)} required minLength={4} /></label>
      <label style={{display:'grid',gap:6}}>Token <input className="dz-input-field" dir="ltr" autoComplete="off" type="password" value={token} onChange={e=>setToken(e.target.value)} required minLength={4} /></label>
      <p className="dz-int-guided-note">من لوحة E-com Delivery افتح صفحة «Développement»، ثم انسخ KEY وToken. أنشئ الشحنات من حساب E-com كالمعتاد؛ تاجر تراك يقرأ بياناتها ويتابع الحالات فقط. لا تستخدم بيانات API v1 القديمة ولا تشارك هذه القيم مع أي شخص.</p>
      <button type="submit" className="dz-btn" disabled={busy || !key.trim() || !token.trim()}>{busy ? 'جارٍ التحقق والحفظ...' : 'التحقق من الحساب وربطه'}</button>
    </form>}
    {message && <p role={failed?'alert':'status'} className="dz-int-guided-note" style={failed?{color:'#b42318',background:'#fff4f2',padding:12,borderRadius:9}:{}}>{message}</p>}
  </article>;
}
