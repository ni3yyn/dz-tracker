'use client';

import { useState, type FormEvent } from 'react';
import type { ExchangeRequestSummary } from '../../../lib/exchange';
import { EXCHANGE_REQUEST_REASONS } from '../../../lib/exchange';
import styles from './exchange.module.css';

interface Props { trackingUuid: string; externalOrderId: string; initialRequest: ExchangeRequestSummary | null }
const statusCopy = {
  pending: { title: 'طلبك قيد المراجعة', description: 'تم إرسال طلبك إلى المتجر، وستظهر هنا أي مستجدات.' },
  awaiting_shipment: { title: 'وافق المتجر على طلب الاستبدال', description: 'وافق المتجر على طلبك ويعمل على تجهيز المنتج البديل. ستظهر تفاصيل الشحنة هنا بمجرد ربطها.' },
  replacement_in_transit: { title: 'شحنة الاستبدال في الطريق', description: 'تم ربط شحنة المنتج البديل بطلبك. تابع مستجداتها من هذه الصفحة.' },
  completed: { title: 'اكتمل الاستبدال', description: 'تم تسليم المنتج البديل بنجاح.' },
  rejected: { title: 'لم تتم الموافقة على الطلب', description: 'يمكنك مراجعة رد المتجر أو إرسال طلب جديد عند الحاجة.' },
} as const;

export function ExchangeRequestCard({ trackingUuid, externalOrderId, initialRequest }: Props) {
  const [request, setRequest] = useState<ExchangeRequestSummary | null>(initialRequest);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const reasonLabel = (value: string) => EXCHANGE_REQUEST_REASONS.find((item) => item.value === value)?.label || value;

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || isSubmitting) { setError('يرجى اختيار سبب الاستبدال.'); return; }
    setIsSubmitting(true); setError('');
    try {
      const response = await fetch(`/api/track/${encodeURIComponent(trackingUuid)}/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, note }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.request) { setError(payload.error || 'تعذر إرسال الطلب. حاول مجدداً.'); return; }
      setRequest(payload.request as ExchangeRequestSummary); setFormOpen(false); setReason(''); setNote('');
    } catch { setError('تعذر الاتصال بالمتجر حالياً. تحقق من اتصالك ثم حاول مجدداً.'); }
    finally { setIsSubmitting(false); }
  }

  return <section className={styles.section} aria-labelledby="exchange-request-title">
    <div className={styles.headingRow}><div><span className={styles.eyebrow}>خدمات ما بعد البيع</span><h2 id="exchange-request-title" className={styles.title}>طلب استبدال المنتج</h2><p className={styles.description}>لديك مشكلة في المنتج الذي استلمته؟ أرسل طلبك إلى المتجر مع توضيح السبب.</p></div><span className={styles.orderRef} dir="ltr">#{externalOrderId}</span></div>
    {request && <div className={`${styles.requestStatus} ${styles[`status_${request.status}`] || ''}`} role="status"><strong>{statusCopy[request.status].title}</strong><p>{statusCopy[request.status].description}</p><div className={styles.requestReason}>السبب: {reasonLabel(request.reason)}</div>{request.customer_note && <p className={styles.requestNote}>{request.customer_note}</p>}{request.replacement_shipment && <div className={styles.merchantResponse}><span>شحنة الاستبدال</span><p>{request.replacement_shipment.carrier_name || 'شركة التوصيل'} · {request.replacement_shipment.status_title || request.replacement_shipment.current_status}</p>{request.replacement_shipment.carrier_tracking_number && <p dir="ltr">{request.replacement_shipment.carrier_tracking_number}</p>}</div>}{request.merchant_response && <div className={styles.merchantResponse}><span>رد المتجر</span><p>{request.merchant_response}</p></div>}</div>}
    {(!request || request.status === 'rejected') && <>{!formOpen ? <button type="button" className={styles.secondaryButton} onClick={() => { setFormOpen(true); setError(''); }}>{request ? 'تقديم طلب استبدال جديد' : 'أرغب في استبدال المنتج'}</button> : <form className={styles.form} onSubmit={submitRequest}>
      <label className={styles.reasonLabel}>ما سبب رغبتك في الاستبدال؟
        <select className={styles.reasonSelect} value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} required>
          <option value="" disabled>اختر سبب الاستبدال</option>
          {EXCHANGE_REQUEST_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className={styles.noteLabel}>تفاصيل إضافية <span>اختياري</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="أضف توضيحاً يساعد المتجر على معالجة طلبك..." /><small>{note.length}/500</small></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.formActions}><button type="button" className={styles.textButton} onClick={() => { setFormOpen(false); setError(''); }}>إلغاء</button><button type="submit" className={styles.submitButton} disabled={isSubmitting || !reason}>{isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الاستبدال'}</button></div>
    </form>}</>}
  </section>;
}
