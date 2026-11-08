'use client';

import React, { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createElogistiaShipment, getElogistiaDispatchOptions, getElogistiaDispatchStatus } from './elogistia-actions';
import { BrandedSelect } from './BrandedSelect';

type Props = {
  order: {
    id: string;
    external_order_id: string;
    customer_name: string | null;
    customer_phone: string | null;
    product_name: string | null;
    carrier_name: string | null;
    carrier_tracking_number: string | null;
    carrier_metadata?: any;
  };
};
type Wilaya = { id: string; name: string };
type Commune = { id: string; name: string; wilayaId: string };
type Rates = { home: number; stopDesk: number } | null;

export function ElogistiaDispatchPanel({ order }: Props) {
  const router = useRouter();
  const prefix = useId();
  const nameParts = (order.customer_name || '').trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' '));
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(order.customer_phone || '');
  const [address, setAddress] = useState('');
  const [product, setProduct] = useState(order.product_name || '');
  const [codAmount, setCodAmount] = useState('');
  const [exchangeProduct, setExchangeProduct] = useState('');
  const [deliveryType, setDeliveryType] = useState<'home' | 'stopdesk'>('home');
  const [deliveryMode, setDeliveryMode] = useState<'standard' | 'exchange'>('standard');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [wilayaId, setWilayaId] = useState('');
  const [commune, setCommune] = useState('');
  const [rates, setRates] = useState<Rates>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCommunes, setLoadingCommunes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successTracking, setSuccessTracking] = useState(order.carrier_tracking_number || '');
  const [isLinked, setIsLinked] = useState(Boolean(order.carrier_tracking_number));
  const [attemptState, setAttemptState] = useState<'pending' | 'failed' | 'uncertain' | 'created' | null>(null);
  const [attemptError, setAttemptError] = useState('');
  const [expanded, setExpanded] = useState(order.carrier_name === 'Elogistia');

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    Promise.all([getElogistiaDispatchOptions(), getElogistiaDispatchStatus(order.id)]).then(([options, dispatch]) => {
      if (!active) return;
      if (!options.success) throw new Error(options.error || 'تعذر تحميل ولايات Elogistia.');
      setWilayas(options.wilayas || []);
      if (dispatch.success && dispatch.attempt) {
        setAttemptState(dispatch.attempt.attempt_state);
        setAttemptError(dispatch.attempt.error_message || '');
        if (dispatch.attempt.tracking_number) setSuccessTracking(dispatch.attempt.tracking_number);
        setIsLinked(Boolean(dispatch.attempt.linked));
      }
    }).catch((reason: any) => {
      if (active) setError(reason?.message || 'تعذر تحميل بيانات Elogistia.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [order.id, expanded]);

  async function selectWilaya(value: string) {
    setWilayaId(value); setCommune(''); setCommunes([]); setRates(null);
    if (!value) return;
    setLoadingCommunes(true); setError('');
    try {
      const result = await getElogistiaDispatchOptions(value);
      if (!result.success) throw new Error(result.error || 'تعذر تحميل بلديات الولاية.');
      setCommunes(result.communes || []);
      setRates(result.rates || null);
    } catch (reason: any) {
      setError(reason?.message || 'تعذر تحميل بلديات الولاية.');
    } finally { setLoadingCommunes(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || successTracking) return;
    setSubmitting(true); setError('');
    try {
      const result = await createElogistiaShipment(order.id, {
        firstName, lastName, email, phone, address, wilayaId, wilayaName: wilayas.find(row => row.id === wilayaId)?.name || '', commune, product,
        codAmount: codAmount === '' ? null as any : Number(codAmount), deliveryType, deliveryMode, exchangeProduct,
        weight: weight ? Number(weight) : null, note,
      });
      if (!result.success || !result.trackingNumber) {
        if (result.trackingNumber) { setSuccessTracking(result.trackingNumber); setIsLinked(false); }
        throw new Error(result.error || 'تعذر إنشاء الشحنة لدى Elogistia.');
      }
      setSuccessTracking(result.trackingNumber);
      setIsLinked(true);
      setAttemptState('created');
      router.refresh();
    } catch (reason: any) {
      setError(reason?.message || 'تعذر إنشاء الشحنة لدى Elogistia.');
      const latest = await getElogistiaDispatchStatus(order.id);
      if (latest.success && latest.attempt) {
        setAttemptState(latest.attempt.attempt_state);
        setAttemptError(latest.attempt.error_message || '');
        if (latest.attempt.tracking_number) setSuccessTracking(latest.attempt.tracking_number);
        setIsLinked(Boolean(latest.attempt.linked));
      }
    } finally { setSubmitting(false); }
  }

  const assigned = Boolean(order.carrier_tracking_number);
  const alreadyElogistia = order.carrier_name === 'Elogistia' && assigned;
  const unresolvedAttempt = attemptState === 'pending' || attemptState === 'uncertain' || (attemptState === 'created' && !successTracking);
  return <section className="dz-int-guided-panel" style={{ marginTop: 14 }}>
    <div className="dz-int-guided-panel-title">
      <span className="dz-int-guided-number">E</span>
      <div><h4>شحنة Elogistia</h4><p style={{ fontSize: 15, lineHeight: 1.7 }}>أنشئ بوليصة الشحن من هذا الطلب. سيستخدم تاجر تراك رقم الطلب الحالي مرجعاً لدى Elogistia، ولن ينشئ طلباً داخلياً مكرراً.</p></div>
      {order.carrier_name !== 'Elogistia' && <button type="button" className="dz-btn" onClick={() => setExpanded(value => !value)}>{expanded ? 'إخفاء خيارات Elogistia' : 'إنشاء شحنة عبر Elogistia'}</button>}
    </div>
    {!expanded && order.carrier_name !== 'Elogistia' ? (
      <p className="dz-int-guided-note">يمكنك إنشاء بوليصة Elogistia لهذا الطلب دون مغادرة تفاصيله. لن يتم إرسال أي شيء إلى شركة التوصيل حتى تضغط زر إنشاء الشحنة.</p>
    ) : successTracking ? (
      <div role="status" aria-live="polite" style={{ display: 'grid', gap: 10 }}>
        <div className="dz-int-guided-meta"><span>حالة الشحنة</span><strong>{isLinked ? 'تم إنشاء الشحنة وربطها بالطلب' : 'تم الإنشاء لدى Elogistia — الربط المحلي يحتاج متابعة'}</strong><span>رقم التتبع</span><strong dir="ltr">{successTracking}</strong><span>رقم طلب متجرك لدى Elogistia</span><strong dir="ltr">{order.external_order_id}</strong></div>
        {isLinked ? (!alreadyElogistia && <p className="dz-int-guided-note">تم إنشاء الشحنة وربطها بالطلب. حدّث تفاصيل الطلب لعرض جميع بيانات Elogistia المحفوظة.</p>) : <p role="alert" className="dz-int-guided-note" style={{ color: '#92400e', background: '#fff7e6', padding: 12, borderRadius: 9 }}>لا تنشئ شحنة أخرى. احتفظ برقم التتبع أعلاه واربطه بالطلب يدوياً أو تواصل مع الدعم حتى لا يتكرر الطرد.</p>}
      </div>
    ) : assigned ? (
      <p className="dz-int-guided-note" role="status">هذا الطلب مرتبط بالفعل بشركة {order.carrier_name || 'توصيل'} وبرقم تتبع {order.carrier_tracking_number}. لن ننشئ بوليصة ثانية لتفادي الشحن المكرر.</p>
    ) : unresolvedAttempt ? (
      <div role="alert" className="dz-int-guided-note" style={{ color: '#92400e', background: '#fff7e6', padding: 14, borderRadius: 9, lineHeight: 1.8 }}>
        <strong>{attemptState === 'pending' ? 'توجد محاولة إنشاء قيد المعالجة.' : 'لم نستطع تأكيد نتيجة محاولة Elogistia السابقة.'}</strong>
        <p style={{ margin: '6px 0' }}>لا تضغط إنشاء مرة أخرى الآن. افحص لوحة Elogistia وابحث عن الطلب بالمرجع <b dir="ltr">{order.external_order_id}</b>. إذا ظهرت الشحنة، احتفظ برقم تتبعها وتواصل مع الدعم. {attemptError}</p>
      </div>
    ) : loading ? <p className="dz-int-guided-note">جارٍ تحميل ولايات Elogistia...</p> : wilayas.length === 0 ? (
      <p className="dz-int-guided-note" role={error ? 'alert' : 'status'}>{error || 'اربط حساب Elogistia أولاً من قسم التكاملات، ثم أعد فتح تفاصيل الطلب.'}</p>
    ) : (
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 10 }}>
        {attemptState === 'failed' && attemptError && <p role="status" className="dz-int-guided-note" style={{ color: '#8a4b08', background: '#fff7e6', padding: 11, borderRadius: 9 }}>رفضت Elogistia المحاولة السابقة بشكل واضح؛ يمكنك تصحيح البيانات ثم إعادة المحاولة. {attemptError}</p>}
        {error && <p role="alert" className="dz-int-guided-note" style={{ color: '#b42318', background: '#fff4f2', padding: 11, borderRadius: 9 }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label htmlFor={prefix+'-first'} style={{ display: 'grid', gap: 6 }}>الاسم الأول *
            <input id={prefix+'-first'} className="dz-input-field" value={firstName} onChange={e=>setFirstName(e.target.value)} required maxLength={100}/>
          </label>
          <label htmlFor={prefix+'-last'} style={{ display: 'grid', gap: 6 }}>اسم العائلة *
            <input id={prefix+'-last'} className="dz-input-field" value={lastName} onChange={e=>setLastName(e.target.value)} required maxLength={100}/>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label htmlFor={prefix+'-phone'} style={{ display: 'grid', gap: 6 }}>هاتف العميل *
            <input id={prefix+'-phone'} className="dz-input-field" dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} required maxLength={20}/>
          </label>
          <label htmlFor={prefix+'-email'} style={{ display: 'grid', gap: 6 }}>البريد الإلكتروني * <span style={{ fontSize: 12, color: '#64748b' }}>تطلب Elogistia هذا الحقل عند إنشاء الشحنة.</span>
            <input id={prefix+'-email'} className="dz-input-field" dir="ltr" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} placeholder="البريد الإلكتروني للعميل"/>
          </label>
        </div>
        <label htmlFor={prefix+'-address'} style={{ display: 'grid', gap: 6 }}>عنوان التوصيل بالتفصيل *
          <input id={prefix+'-address'} className="dz-input-field" value={address} onChange={e=>setAddress(e.target.value)} required maxLength={500} placeholder="الحي، الشارع، رقم المنزل..."/>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label htmlFor={prefix+'-wilaya'} style={{ display: 'grid', gap: 6 }}>الولاية *
            <BrandedSelect
              id={prefix+'-wilaya'}
              ariaLabel="الولاية"
              value={wilayaId}
              onChange={(value)=>void selectWilaya(value)}
              placeholder="اختر الولاية"
              variant="field"
              options={wilayas.map((row)=>({value:row.id,label:`${row.id} — ${row.name}`}))}
            />
          </label>
          <label htmlFor={prefix+'-commune'} style={{ display: 'grid', gap: 6 }}>البلدية *
            <BrandedSelect
              id={prefix+'-commune'}
              ariaLabel="البلدية"
              value={commune}
              onChange={setCommune}
              placeholder={loadingCommunes?'جارٍ التحميل...':'اختر البلدية'}
              disabled={!wilayaId||loadingCommunes}
              variant="field"
              options={communes.map((row)=>({value:row.name,label:row.name}))}
            />
          </label>
        </div>
        {rates && <p className="dz-int-guided-note" style={{ fontSize: 13 }}>تعريفة Elogistia لهذه الولاية: المنزل <b>{rates.home.toLocaleString('ar-DZ')} دج</b> · المكتب <b>{rates.stopDesk.toLocaleString('ar-DZ')} دج</b>. هذه تعريفة الشركة ولا تُضاف تلقائياً إلى مبلغ التحصيل.</p>}
        <label htmlFor={prefix+'-product'} style={{ display: 'grid', gap: 6 }}>محتوى الطرد / اسم المنتج *
          <input id={prefix+'-product'} className="dz-input-field" value={product} onChange={e=>setProduct(e.target.value)} required maxLength={500}/>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label htmlFor={prefix+'-cod'} style={{ display: 'grid', gap: 6 }}>مبلغ التحصيل عند التسليم (دج) *
            <input id={prefix+'-cod'} className="dz-input-field" dir="ltr" type="number" min="0" step="1" value={codAmount} onChange={e=>setCodAmount(e.target.value)} required/>
          </label>
          <label htmlFor={prefix+'-weight'} style={{ display: 'grid', gap: 6 }}>وزن الطرد (كغ)
            <input id={prefix+'-weight'} className="dz-input-field" dir="ltr" type="number" min="0.1" max="1000" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="اختياري"/>
          </label>
        </div>
        {deliveryMode === 'exchange' && (
          <label htmlFor={prefix+'-exchange-product'} style={{ display: 'grid', gap: 6 }}>المنتج الذي سيُستبدل به الطرد *
            <input id={prefix+'-exchange-product'} className="dz-input-field" value={exchangeProduct} onChange={e=>setExchangeProduct(e.target.value)} required maxLength={250} placeholder="اسم المنتج البديل"/>
          </label>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label htmlFor={prefix+'-delivery'} style={{ display: 'grid', gap: 6 }}>طريقة التوصيل *
            <BrandedSelect
              id={prefix+'-delivery'}
              ariaLabel="طريقة التوصيل"
              value={deliveryType}
              onChange={(value)=>setDeliveryType(value as 'home'|'stopdesk')}
              variant="field"
              options={[
                {value:'home',label:'إلى المنزل'},
                {value:'stopdesk',label:'مكتب Elogistia'},
              ]}
            />
          </label>
          <label htmlFor={prefix+'-mode'} style={{ display: 'grid', gap: 6 }}>نوع العملية *
            <BrandedSelect
              id={prefix+'-mode'}
              ariaLabel="نوع العملية"
              value={deliveryMode}
              onChange={(value)=>setDeliveryMode(value as 'standard'|'exchange')}
              variant="field"
              options={[
                {value:'standard',label:'إرسال عادي'},
                {value:'exchange',label:'تبادل (Exchange)'},
              ]}
            />
          </label>
        </div>
        <label htmlFor={prefix+'-note'} style={{ display: 'grid', gap: 6 }}>ملاحظة لشركة التوصيل
          <textarea id={prefix+'-note'} className="dz-input-field" value={note} onChange={e=>setNote(e.target.value)} rows={2} maxLength={500}/>
        </label>
        <p className="dz-int-guided-note" style={{ fontSize: 13 }}>مرجع الطلب المرسل إلى Elogistia: <b dir="ltr">{order.external_order_id}</b>. سيتم إرسال بيانات الشحنة عند الضغط على زر الإنشاء، لذلك راجع العنوان ومبلغ التحصيل قبل المتابعة.</p>
        {error && <p role="alert" className="dz-int-guided-note" style={{ color: '#b42318', background: '#fff4f2', padding: 12, borderRadius: 9 }}>{error}</p>}
        <button type="submit" className="dz-btn" disabled={submitting||loadingCommunes||!wilayaId||!commune||!phone.trim()||!address.trim()||!product.trim()||!firstName.trim()||!lastName.trim()||!email.trim()||codAmount.trim()===''||(deliveryMode==='exchange'&&!exchangeProduct.trim())}>{submitting?'جارٍ إنشاء الشحنة لدى Elogistia...':'إنشاء شحنة Elogistia وربط رقم التتبع'}</button>
      </form>
    )}
  </section>;
}
