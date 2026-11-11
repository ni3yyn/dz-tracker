'use client';

import { useMemo, useState } from 'react';
import { EXCHANGE_REQUEST_REASONS, type ExchangeRequestStatus, type ExchangeShipmentCandidate, type MerchantExchangeRequest } from '../../../../lib/exchange';
import { confirmExchangeShipmentMatch, reviewExchangeRequest } from '../exchange-actions';
import styles from './exchange-requests.module.css';

interface Props {
  initialRequests: MerchantExchangeRequest[];
  initialCandidates: ExchangeShipmentCandidate[];
  storageAvailable: boolean;
  onApproved?: () => void;
}

type Filter = 'all' | ExchangeRequestStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: 'تحتاج مراجعة' },
  { value: 'awaiting_shipment', label: 'بانتظار الاستبدال' },
  { value: 'replacement_in_transit', label: 'جاري الاستبدال' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'rejected', label: 'مرفوضة' },
];
const STATUS_LABELS: Record<ExchangeRequestStatus, string> = {
  pending: 'بانتظار المراجعة',
  awaiting_shipment: 'بانتظار الاستبدال',
  replacement_in_transit: 'شحنة الاستبدال في الطريق',
  completed: 'اكتمل الاستبدال',
  rejected: 'مرفوضة',
};

export function ExchangeRequestsTab({ initialRequests, initialCandidates, storageAvailable, onApproved }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [filter, setFilter] = useState<Filter>('pending');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [candidateSelections, setCandidateSelections] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((item) => item.status === 'pending').length,
    awaiting_shipment: requests.filter((item) => item.status === 'awaiting_shipment').length,
    replacement_in_transit: requests.filter((item) => item.status === 'replacement_in_transit').length,
    completed: requests.filter((item) => item.status === 'completed').length,
    rejected: requests.filter((item) => item.status === 'rejected').length,
  }), [requests]);
  const visibleRequests = useMemo(
    () => filter === 'all' ? requests : requests.filter((item) => item.status === filter),
    [filter, requests]
  );

  async function handleReview(item: MerchantExchangeRequest, decision: 'approved' | 'rejected') {
    if (savingId) return;
    setSavingId(item.id); setError(''); setNotice('');
    try {
      const result = await reviewExchangeRequest(item.id, decision, responseDrafts[item.id] || '');
      if (result.error || !result.request) {
        setError(result.error || 'تعذر حفظ القرار. حاول مجدداً.');
        return;
      }
      setRequests((previous) => previous.map((request) => request.id === item.id ? { ...request, ...result.request } : request));
      setNotice(decision === 'approved'
        ? 'تمت الموافقة. أنشئ شحنة المنتج البديل من لوحة شركة التوصيل.'
        : 'تم رفض طلب الاستبدال وإبلاغ الزبون.');
      if (decision === 'approved') onApproved?.();
    } catch {
      setError('تعذر الاتصال بالخادم. حدّث الصفحة ثم حاول مجدداً.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleConfirmCandidate(candidate: ExchangeShipmentCandidate) {
    const requestId = candidateSelections[candidate.id];
    if (!requestId || savingId) return;
    setSavingId(candidate.id); setError(''); setNotice('');
    try {
      const result = await confirmExchangeShipmentMatch(candidate.id, requestId);
      if (result.error || !result.shipment) {
        setError(result.error || 'تعذر ربط الشحنة بطلب الاستبدال.');
        return;
      }
      const linked = result.shipment;
      const nextStatus: ExchangeRequestStatus = linked.current_status === 'delivered'
        ? 'completed'
        : 'replacement_in_transit';
      setRequests((previous) => previous.map((request) => request.id === requestId
        ? { ...request, status: nextStatus, replacement_shipment: linked }
        : request));
      setCandidates((previous) => previous.filter((item) => item.id !== candidate.id));
      setNotice('تم ربط الشحنة بطلب الاستبدال. ستظهر تحديثاتها للزبون في رابط التتبع الأصلي.');
    } catch {
      setError('تعذر الاتصال بالخادم. حدّث الصفحة ثم حاول مجدداً.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>خدمات ما بعد البيع</span>
          <h2>طلبات الاستبدال</h2>
          <p>راجع طلبات الزبائن، وأنشئ شحنة بديلة بعد الموافقة. يتعرف عليها النظام تلقائياً عند وصولها.</p>
        </div>
        <div className={styles.total}><strong>{counts.pending.toLocaleString('ar-DZ')}</strong><span>تحتاج مراجعتك</span></div>
      </div>

      {!storageAvailable && (
        <div className={styles.migrationNotice} role="alert">
          طبّق ملف التحديث <code>20261111_order_exchange_replacement_shipments.sql</code> في Supabase لتفعيل ربط الشحنات البديلة والإشعارات.
        </div>
      )}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      {candidates.length > 0 && (
        <section className={styles.candidates} aria-labelledby="exchange-candidates-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="exchange-candidates-title">شحنات تحتاج تأكيد الربط</h3><p>تطابقت بيانات الشحنة مع أكثر من طلب استبدال؛ اختر الطلب الصحيح قبل ربطها.</p></div>
            <strong>{candidates.length.toLocaleString('ar-DZ')}</strong>
          </div>
          <div className={styles.candidateList}>
            {candidates.map((candidate) => {
              const matchingRequests = requests.filter((request) =>
                candidate.possible_exchange_request_ids.includes(request.id) && request.status === 'awaiting_shipment'
              );
              return (
                <article className={styles.candidate} key={candidate.id}>
                  <div className={styles.candidateDetails}>
                    <strong>{candidate.customer_name || 'زبون غير محدد'}</strong>
                    <span>{candidate.product_name || 'منتج غير محدد'}</span>
                    <span dir="ltr">{candidate.customer_phone || '—'}</span>
                    <small>{candidate.carrier_name || 'شركة التوصيل'} · {candidate.carrier_tracking_number || candidate.carrier_order_id || 'رقم التتبع غير متوفر'}</small>
                  </div>
                  <div className={styles.candidateControls}>
                    <select
                      aria-label="اختر طلب الاستبدال المطابق"
                      value={candidateSelections[candidate.id] || ''}
                      onChange={(event) => setCandidateSelections((previous) => ({ ...previous, [candidate.id]: event.target.value }))}
                    >
                      <option value="">اختر طلب الاستبدال</option>
                      {matchingRequests.map((request) => (
                        <option key={request.id} value={request.id}>
                          #{request.order?.external_order_id || '—'} · {request.order?.customer_name || 'زبون'} · {request.order?.product_name || 'منتج'}
                        </option>
                      ))}
                    </select>
                    <button type="button" disabled={!candidateSelections[candidate.id] || savingId === candidate.id} onClick={() => void handleConfirmCandidate(candidate)}>
                      {savingId === candidate.id ? 'جارٍ الربط...' : 'تأكيد الربط'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className={styles.metrics}>
        <div><span>كل الطلبات</span><strong>{counts.all.toLocaleString('ar-DZ')}</strong></div>
        <div><span>تحتاج مراجعة</span><strong>{counts.pending.toLocaleString('ar-DZ')}</strong></div>
        <div><span>بانتظار الشحنة</span><strong>{counts.awaiting_shipment.toLocaleString('ar-DZ')}</strong></div>
        <div><span>جاري الاستبدال</span><strong>{counts.replacement_in_transit.toLocaleString('ar-DZ')}</strong></div>
        <div><span>مكتملة</span><strong>{counts.completed.toLocaleString('ar-DZ')}</strong></div>
        <div><span>مرفوضة</span><strong>{counts.rejected.toLocaleString('ar-DZ')}</strong></div>
      </div>

      <div className={styles.toolbar} role="tablist" aria-label="تصفية طلبات الاستبدال">
        {FILTERS.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={filter === item.value}
            className={filter === item.value ? styles.filterActive : ''} onClick={() => setFilter(item.value)}>
            {item.label}<span>{counts[item.value].toLocaleString('ar-DZ')}</span>
          </button>
        ))}
      </div>

      {visibleRequests.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true">↻</span>
          <h3>{requests.length === 0 ? 'لا توجد طلبات استبدال بعد' : 'لا توجد طلبات في هذا القسم'}</h3>
          <p>{requests.length === 0 ? 'ستظهر هنا طلبات الزبائن بعد تفعيل الخدمة من الإعدادات.' : 'جرّب اختيار قسم آخر لمراجعة الطلبات.'}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visibleRequests.map((item) => {
            const reasonLabel = EXCHANGE_REQUEST_REASONS.find((reason) => reason.value === item.reason)?.label || item.reason;
            return (
              <article key={item.id} className={styles.request}>
                <div className={styles.requestHeader}>
                  <div>
                    <span className={styles.orderNumber} dir="ltr">#{item.order?.external_order_id || '—'}</span>
                    <h3>{item.order?.customer_name || 'زبون'}</h3>
                    {item.order?.product_name && <p className={styles.product}>{item.order.product_name}</p>}
                  </div>
                  <span className={`${styles.status} ${styles[`status_${item.status}`] || ''}`}><i />{STATUS_LABELS[item.status]}</span>
                </div>
                <div className={styles.reasonBlock}>
                  <span>سبب الاستبدال</span><strong>{reasonLabel}</strong>
                  {item.customer_note && <p>{item.customer_note}</p>}
                </div>
                {item.status === 'awaiting_shipment' && (
                  <p className={styles.nextStep}>أنشئ شحنة جديدة للمنتج البديل لدى شركة التوصيل. عند وصولها سيطابقها تاجر تراك تلقائياً باستخدام بيانات العميل ورقم الهاتف واسم المنتج.</p>
                )}
                {item.replacement_shipment && (
                  <div className={styles.replacementInfo}>
                    <span>شحنة الاستبدال</span>
                    <strong>{item.replacement_shipment.carrier_name || 'شركة التوصيل'}</strong>
                    <p>{item.replacement_shipment.status_title || item.replacement_shipment.current_status}</p>
                    <small dir="ltr">{item.replacement_shipment.carrier_tracking_number || item.replacement_shipment.carrier_order_id || '—'}</small>
                  </div>
                )}
                <div className={styles.requestMeta}>تاريخ الطلب: {new Date(item.created_at).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                {item.status === 'pending' ? (
                  <div className={styles.reviewArea}>
                    <label>رد للزبون <span>اختياري</span>
                      <textarea value={responseDrafts[item.id] || ''} maxLength={500} rows={2}
                        onChange={(event) => setResponseDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))}
                        placeholder="اكتب توضيحاً أو الخطوة التالية..." />
                    </label>
                    <div className={styles.actions}>
                      <button type="button" className={styles.approve} disabled={savingId === item.id} onClick={() => void handleReview(item, 'approved')}>
                        {savingId === item.id ? 'جارٍ الحفظ...' : 'الموافقة على الاستبدال'}
                      </button>
                      <button type="button" className={styles.reject} disabled={savingId === item.id} onClick={() => void handleReview(item, 'rejected')}>رفض الطلب</button>
                    </div>
                  </div>
                ) : item.merchant_response ? (
                  <div className={styles.savedResponse}><span>رد المتجر</span><p>{item.merchant_response}</p></div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
