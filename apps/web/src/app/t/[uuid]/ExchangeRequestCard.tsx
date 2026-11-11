'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ExchangeRequestSummary } from '../../../lib/exchange';
import { EXCHANGE_REQUEST_REASONS } from '../../../lib/exchange';
import styles from './exchange.module.css';

interface Props { trackingUuid: string; externalOrderId: string; initialRequest: ExchangeRequestSummary | null }

const statusCopy = {
  pending: { title: 'طلبك قيد المراجعة', description: 'وصل طلبك إلى المتجر. سيظهر هنا قرار المتجر وأي تحديث جديد.' },
  awaiting_shipment: { title: 'تمت الموافقة على الاستبدال', description: 'وافق المتجر على طلبك ويعمل على تجهيز المنتج البديل.' },
  replacement_in_transit: { title: 'المنتج البديل في الطريق', description: 'تم ربط شحنة الاستبدال بطلبك. تابع تحديثاتها من هذه الصفحة.' },
  completed: { title: 'اكتمل الاستبدال', description: 'تم تسليم المنتج البديل بنجاح. شكراً لثقتك بالمتجر.' },
  rejected: { title: 'لم تتم الموافقة على الطلب', description: 'راجع رد المتجر أدناه. يمكنك تقديم طلب جديد عند الحاجة.' },
} as const;

const progressStages = [
  { status: 'pending', label: 'تم الإرسال' },
  { status: 'awaiting_shipment', label: 'موافقة المتجر' },
  { status: 'replacement_in_transit', label: 'شحن البديل' },
  { status: 'completed', label: 'اكتمل الاستبدال' },
] as const;

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ExchangeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h11l-2.8-2.8M18 7l-2.8 2.8M17 17H6l2.8 2.8M6 17l2.8-2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 7a7 7 0 0 1 1.2 8M6 17a7 7 0 0 1-1.2-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function StatusIcon({ status }: { status: ExchangeRequestSummary['status'] }) {
  if (status === 'rejected') return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 21 19H3l9-15.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M12 9v4.5m0 2.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  if (status === 'completed') return <CheckIcon />;
  if (status === 'replacement_in_transit') return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="7" cy="18" r="1.7" stroke="currentColor" strokeWidth="1.7" /><circle cx="18" cy="18" r="1.7" stroke="currentColor" strokeWidth="1.7" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ExchangeRequestCard({ trackingUuid, externalOrderId, initialRequest }: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [request, setRequest] = useState<ExchangeRequestSummary | null>(initialRequest);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const reasonLabel = (value: string) => EXCHANGE_REQUEST_REASONS.find((item) => item.value === value)?.label || value;
  const currentProgressIndex = request ? progressStages.findIndex((stage) => stage.status === request.status) : -1;
  const canRequestAgain = !request || request.status === 'rejected';

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setIsRevealed(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIsRevealed(true); observer.disconnect(); }
    }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || isSubmitting) { setError('يرجى اختيار سبب الاستبدال.'); return; }
    setIsSubmitting(true); setError('');
    try {
      const response = await fetch(`/api/track/${encodeURIComponent(trackingUuid)}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.request) { setError(payload.error || 'تعذر إرسال الطلب. حاول مجدداً.'); return; }
      setRequest(payload.request as ExchangeRequestSummary);
      setFormOpen(false);
      setReason('');
      setNote('');
    } catch {
      setError('تعذر الاتصال بالمتجر حالياً. تحقق من اتصالك ثم حاول مجدداً.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section ref={sectionRef} className={styles.section} data-revealed={isRevealed ? 'true' : 'false'} aria-labelledby="exchange-request-title">
      <div className={styles.sectionInner}>
        <div className={styles.sectionIntro}>
          <div className={styles.introIdentity}>
            <span className={styles.sectionIcon} aria-hidden="true"><ExchangeIcon /></span>
            <div className={styles.introCopy}>
              <span className={styles.eyebrow}>خدمات ما بعد البيع</span>
              <h2 id="exchange-request-title" className={styles.title}>استبدال المنتج</h2>
              <p className={styles.description}>راحتك تهمّنا. أرسل طلب الاستبدال إلى المتجر وتابع كل مستجداته من هنا.</p>
            </div>
          </div>
          <div className={styles.orderRef}><span>رقم الطلب</span><strong dir="ltr">#{externalOrderId}</strong></div>
        </div>

        {request && (
          <div className={styles.statusPanel} data-state={request.status} role="status" aria-live="polite">
            <div className={styles.statusHead}>
              <span className={styles.statusIcon} aria-hidden="true"><StatusIcon status={request.status} /></span>
              <div className={styles.statusCopy}>
                <span className={styles.statusEyebrow}>حالة طلب الاستبدال</span>
                <h3>{statusCopy[request.status].title}</h3>
                <p>{statusCopy[request.status].description}</p>
              </div>
            </div>

            {request.status !== 'rejected' && (
              <ol className={styles.progress} aria-label="مراحل معالجة طلب الاستبدال">
                {progressStages.map((stage, index) => {
                  const reached = index <= currentProgressIndex;
                  const current = index === currentProgressIndex;
                  return (
                    <li key={stage.status} className={[styles.progressStep, reached ? styles.progressReached : '', current ? styles.progressCurrent : ''].filter(Boolean).join(' ')} aria-current={current ? 'step' : undefined}>
                      <span className={styles.progressMarker}>{index < currentProgressIndex ? <CheckIcon /> : index + 1}</span>
                      <span className={styles.progressLabel}>{stage.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className={styles.requestDetails}>
              <div className={styles.detailItem}><span>سبب الاستبدال</span><strong>{reasonLabel(request.reason)}</strong></div>
              {request.customer_note && <div className={styles.detailItem}><span>توضيحك</span><strong>{request.customer_note}</strong></div>}
            </div>

            {request.replacement_shipment && (
              <div className={styles.shipmentDetails}>
                <div className={styles.shipmentHeading}>
                  <span className={styles.shipmentIcon} aria-hidden="true"><ExchangeIcon /></span>
                  <div><span>شحنة المنتج البديل</span><strong>{request.replacement_shipment.carrier_name || 'شركة التوصيل'}</strong></div>
                </div>
                <div className={styles.shipmentStatus}>
                  <span>{request.replacement_shipment.status_title || request.replacement_shipment.current_status}</span>
                  {request.replacement_shipment.carrier_tracking_number && <strong dir="ltr">{request.replacement_shipment.carrier_tracking_number}</strong>}
                </div>
              </div>
            )}

            {request.merchant_response && <div className={styles.merchantResponse}><span>رد المتجر</span><p>{request.merchant_response}</p></div>}
          </div>
        )}

        {canRequestAgain && !formOpen && (
          <div className={styles.actionRow}>
            <div className={styles.actionCopy}>
              <strong>{request ? 'هل ما زلت بحاجة إلى الاستبدال؟' : 'هل ترغب في استبدال المنتج؟'}</strong>
              <span>{request ? 'يمكنك إرسال طلب جديد إلى المتجر.' : 'ابدأ طلبك باختيار السبب المناسب.'}</span>
            </div>
            <button type="button" className={styles.actionButton} onClick={() => { setFormOpen(true); setError(''); }}>
              <span>{request ? 'تقديم طلب جديد' : 'أرغب في استبدال المنتج'}</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}

        {canRequestAgain && formOpen && (
          <form className={styles.formPanel} onSubmit={submitRequest}>
            <div className={styles.formHeading}>
              <div><span className={styles.formStep}>طلب استبدال جديد</span><h3>أخبرنا كيف يمكننا مساعدتك</h3></div>
              <button type="button" className={styles.closeForm} onClick={() => { setFormOpen(false); setError(''); }} aria-label="إغلاق نموذج الاستبدال">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className={styles.formFields}>
              <label className={styles.reasonLabel}>ما سبب رغبتك في الاستبدال؟
                <select className={styles.reasonSelect} value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} required>
                  <option value="" disabled>اختر سبب الاستبدال</option>
                  {EXCHANGE_REQUEST_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className={styles.noteLabel}>تفاصيل إضافية <span>اختياري</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="أضف توضيحاً يساعد المتجر على معالجة طلبك..." />
                <small>{note.length}/500</small>
              </label>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.textButton} onClick={() => { setFormOpen(false); setError(''); }} disabled={isSubmitting}>إلغاء</button>
              <button type="submit" className={styles.submitButton} disabled={isSubmitting || !reason}>{isSubmitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الاستبدال'}</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
