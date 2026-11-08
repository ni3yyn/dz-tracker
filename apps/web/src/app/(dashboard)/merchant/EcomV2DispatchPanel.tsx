'use client';

import React, { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEcomV2Shipment, getEcomV2DispatchOptions, getEcomV2DispatchStatus } from './ecom-v2-actions';
import { BrandedSelect } from './BrandedSelect';

type Props = { order: { id:string; external_order_id:string; customer_name:string|null; customer_phone:string|null; product_name:string|null; carrier_name:string|null; carrier_tracking_number:string|null; carrier_metadata?:any } };
type Options = { id:string; name:string; home:boolean; stopdesk:boolean }[];
export function EcomV2DispatchPanel({ order }: Props) {
  const router = useRouter(); const id = useId();
  const [name,setName]=useState(order.customer_name||'');
  const [phone,setPhone]=useState(order.customer_phone||'');
  const [address,setAddress]=useState('');
  const [product,setProduct]=useState(order.product_name||'');
  const [quantity,setQuantity]=useState('1');
  const [amount,setAmount]=useState('');
  const [wilayas,setWilayas]=useState<Options>([]);
  const [wilaya,setWilaya]=useState('');
  const [communes,setCommunes]=useState<{id:string;name:string}[]>([]);
  const [commune,setCommune]=useState('');
  const [desks,setDesks]=useState<{id:string;name:string;commune:string;address:string}[]>([]);
  const [desk,setDesk]=useState('');
  const [mode,setMode]=useState<'home'|'stopdesk'>('home');
  const [rates,setRates]=useState<{home:number;stopDesk:number}|null>(null);
  const [loading,setLoading]=useState(true); const [loadingWilaya,setLoadingWilaya]=useState(false);
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [tracking,setTracking]=useState(order.carrier_tracking_number||'');
  const [linked,setLinked]=useState(Boolean(order.carrier_tracking_number));
  const [attempt,setAttempt]=useState<any>(null);
  const [expanded,setExpanded]=useState(order.carrier_name==='E-com Delivery v2');
  useEffect(()=>{ if(!expanded)return; let active=true;
    Promise.all([getEcomV2DispatchOptions(),getEcomV2DispatchStatus(order.id)]).then(([o,a])=>{
      if(!active)return; if(!o.success)throw new Error(o.error||'تعذر تحميل الولايات.');
      setWilayas(o.wilayas||[]); if(a.success&&a.attempt){setAttempt(a.attempt);if(a.attempt.tracking_number)setTracking(a.attempt.tracking_number);setLinked(Boolean(a.attempt.linked));}
    }).catch(e=>{if(active)setError(e?.message||'تعذر تحميل بيانات E-com Delivery.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[expanded,order.id]);
  async function chooseWilaya(value:string){
    setWilaya(value);setCommune('');setDesk('');setCommunes([]);setDesks([]);setRates(null);
    if(!value)return;setLoadingWilaya(true);setError('');
    try{const o=await getEcomV2DispatchOptions(value);if(!o.success)throw new Error(o.error);setCommunes(o.communes||[]);setDesks(o.desks||[]);setRates(o.rates||null);}
    catch(e:any){setError(e?.message||'تعذر تحميل خيارات الولاية.');}finally{setLoadingWilaya(false);}
  }
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy||tracking)return;setBusy(true);setError('');
    try{
      const result=await createEcomV2Shipment(order.id,{recipientName:name,phone,address,wilayaId:wilaya,commune,product,quantity:Number(quantity),codAmount:Number(amount),deliveryType:mode,stopDeskId:desk});
      if(!result.success||!result.trackingNumber){if(result.trackingNumber)setTracking(result.trackingNumber);throw new Error(result.error||'تعذر إنشاء الشحنة.');}
      setTracking(result.trackingNumber);setLinked(true);router.refresh();
    }catch(e:any){setError(e?.message||'تعذر إنشاء الشحنة.');const latest=await getEcomV2DispatchStatus(order.id);if(latest.success&&latest.attempt){setAttempt(latest.attempt);if(latest.attempt.tracking_number)setTracking(latest.attempt.tracking_number);setLinked(Boolean(latest.attempt.linked));}}
    finally{setBusy(false);}
  }
  const unresolved=attempt&&(attempt.attempt_state==='pending'||attempt.attempt_state==='uncertain'||(attempt.attempt_state==='created'&&!tracking));
  return <section className="dz-int-guided-panel" style={{marginTop:14}}>
    <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">EC</span><div><h4>شحنة E-com Delivery v2</h4><p style={{fontSize:15,lineHeight:1.7}}>أنشئ بوليصة من الطلب الحالي. يستخدم تاجر تراك مرجع الطلب الأصلي، ولا ينشئ طلباً داخلياً مكرراً.</p></div>
      {order.carrier_name!=='E-com Delivery v2'&&<button type="button" className="dz-btn" onClick={()=>setExpanded(v=>!v)}>{expanded?'إخفاء':'إنشاء شحنة E-com v2'}</button>}
    </div>
    {!expanded&&order.carrier_name!=='E-com Delivery v2'?<p className="dz-int-guided-note">لن يُرسل شيء إلى شركة التوصيل حتى تضغط زر إنشاء الشحنة.</p>
    :tracking?<><div className="dz-int-guided-meta"><span>الحالة</span><strong>{linked?'تم إنشاء الشحنة وربطها':'تم الإنشاء ويحتاج الربط المحلي إلى متابعة'}</strong><span>رقم التتبع</span><strong dir="ltr">{tracking}</strong><span>مرجع طلب متجرك</span><strong dir="ltr">{order.external_order_id}</strong></div>{!linked&&error&&<p role="alert" className="dz-int-guided-note" style={{color:'#92400e',background:'#fff7e6',padding:12,borderRadius:9}}>{error}</p>}</>
    :unresolved?<p role="alert" className="dz-int-guided-note" style={{color:'#92400e',background:'#fff7e6',padding:12,borderRadius:9}}>توجد محاولة سابقة غير محسومة. افحص لوحة E-com Delivery بالمرجع <b dir="ltr">{order.external_order_id}</b> قبل إعادة المحاولة. لا تنشئ طرداً مكرراً. {attempt.error_message||''}</p>
    :order.carrier_tracking_number?<p className="dz-int-guided-note">هذا الطلب مرتبط بالفعل برقم تتبع {order.carrier_tracking_number} لدى {order.carrier_name}. لن ننشئ شحنة ثانية.</p>
    :loading?<p className="dz-int-guided-note">جارٍ تحميل ولايات E-com Delivery...</p>
    :!wilayas.length?<p role={error?'alert':'status'} className="dz-int-guided-note">{error||'اربط حساب E-com Delivery من قسم التكاملات أولاً.'}</p>
    :<form onSubmit={submit} style={{display:'grid',gap:12,marginTop:10}}>
      {attempt?.attempt_state==='failed'&&attempt.error_message&&<p className="dz-int-guided-note" style={{color:'#8a4b08',background:'#fff7e6',padding:10,borderRadius:9}}>رفضت الشركة المحاولة السابقة بشكل واضح؛ يمكنك تصحيح البيانات ثم إعادة المحاولة. {attempt.error_message}</p>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <label style={{display:'grid',gap:6}}>اسم المستلم *<input className="dz-input-field" value={name} onChange={e=>setName(e.target.value)} maxLength={60} required /></label>
        <label style={{display:'grid',gap:6}}>هاتف العميل *<input className="dz-input-field" dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={20} required /></label>
      </div>
      <label style={{display:'grid',gap:6}}>عنوان التوصيل (حتى 100 حرف) *<input className="dz-input-field" value={address} onChange={e=>setAddress(e.target.value)} maxLength={100} required /></label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <label htmlFor={id+'-wilaya'} style={{display:'grid',gap:6}}>الولاية *
          <BrandedSelect
            id={id+'-wilaya'}
            ariaLabel="الولاية"
            value={wilaya}
            onChange={(value)=>void chooseWilaya(value)}
            placeholder="اختر الولاية"
            variant="field"
            options={wilayas.map((w)=>({value:w.id,label:`${w.id} — ${w.name}`}))}
          />
        </label>
        <label htmlFor={id+'-delivery-mode'} style={{display:'grid',gap:6}}>طريقة التوصيل *
          <BrandedSelect
            id={id+'-delivery-mode'}
            ariaLabel="طريقة التوصيل"
            value={mode}
            onChange={(value)=>{setMode(value as 'home'|'stopdesk');setCommune('');setDesk('');}}
            variant="field"
            options={[
              {value:'home',label:'إلى المنزل'},
              {value:'stopdesk',label:'مكتب استلام'},
            ]}
          />
        </label>
      </div>
      {mode==='home'
        ? <label htmlFor={id+'-commune'} style={{display:'grid',gap:6}}>البلدية المتاحة *
            <BrandedSelect
              id={id+'-commune'}
              ariaLabel="البلدية المتاحة"
              value={commune}
              onChange={setCommune}
              placeholder={loadingWilaya?'جارٍ التحميل...':'اختر البلدية'}
              disabled={!wilaya||loadingWilaya}
              variant="field"
              options={communes.map((c)=>({value:c.name,label:c.name}))}
            />
          </label>
        : <label htmlFor={id+'-desk'} style={{display:'grid',gap:6}}>مكتب الاستلام *
            <BrandedSelect
              id={id+'-desk'}
              ariaLabel="مكتب الاستلام"
              value={desk}
              onChange={setDesk}
              placeholder="اختر مكتب E-com"
              disabled={!wilaya||loadingWilaya}
              variant="field"
              options={desks.map((d)=>({value:String(d.id),label:d.name+(d.commune?' — '+d.commune:'')}))}
            />
          </label>}
      {rates&&<p className="dz-int-guided-note" style={{fontSize:13}}>تعريفة الشركة: المنزل {rates.home.toLocaleString('ar-DZ')} دج · المكتب {rates.stopDesk.toLocaleString('ar-DZ')} دج. لا تُضاف تلقائياً إلى مبلغ التحصيل.</p>}
      <label style={{display:'grid',gap:6}}>المنتج *<input className="dz-input-field" value={product} onChange={e=>setProduct(e.target.value)} maxLength={200} required /></label>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <label style={{display:'grid',gap:6}}>الكمية *<input className="dz-input-field" dir="ltr" type="number" min="1" max="999" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required /></label>
        <label style={{display:'grid',gap:6}}>مبلغ التحصيل (دج) *<input className="dz-input-field" dir="ltr" type="number" min="0" step="1" value={amount} onChange={e=>setAmount(e.target.value)} required /></label>
      </div>
      <label style={{display:'grid',gap:6}}>ملاحظة للشركة<textarea className="dz-input-field" value={note} onChange={e=>setNote(e.target.value)} rows={2} maxLength={500}/></label>
      <p className="dz-int-guided-note" style={{fontSize:13}}>مرجع الطلب لدى E-com: <b dir="ltr">{order.external_order_id}</b>. ستُنشأ الشحنة في حالة «En Préparation»؛ أكدها من حساب E-com عندما تكون جاهزاً لإرسالها.</p>
      {error&&<p role="alert" className="dz-int-guided-note" style={{color:'#b42318',background:'#fff4f2',padding:12,borderRadius:9}}>{error}</p>}
      <button type="submit" className="dz-btn" disabled={busy||loadingWilaya||!name.trim()||!phone.trim()||!address.trim()||!wilaya||!product.trim()||!amount.trim()||(mode==='home'&&!commune)||(mode==='stopdesk'&&!desk)}>{busy?'جارٍ إنشاء الشحنة...':'إنشاء الشحنة وربط رقم التتبع'}</button>
    </form>}
  </section>;
}
