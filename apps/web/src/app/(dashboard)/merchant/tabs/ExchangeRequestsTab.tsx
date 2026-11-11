'use client';

import { useMemo, useState } from 'react';
import { EXCHANGE_REQUEST_REASONS, type ExchangeRequestStatus, type MerchantExchangeRequest } from '../../../../lib/exchange';
import { reviewExchangeRequest } from '../exchange-actions';
import styles from './exchange-requests.module.css';

interface Props { initialRequests: MerchantExchangeRequest[]; storageAvailable: boolean }
type Filter = 'all' | ExchangeRequestStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'الكل' }, { value: 'pending', label: 'تحتاج مراجعة' },
  { value: 'approved', label: 'تمت الموافقة' }, { value: 'rejected', label: 'مرفوضة' },
];
const STATUS_LABELS: Record<ExchangeRequestStatus, string> = { pending: 'بانتظار المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوضة' };

export function ExchangeRequestsTab({ initialRequests, storageAvailable }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<Filter>('pending');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((item) => item.status === 'pending').length,
    approved: requests.filter((item) => item.status === 'approved').length,
    rejected: requests.filter((item) => item.status === 'rejected').length,
  }), [requests]);
  const visibleRequests = useMemo(() => filter === 'all' ? requests : requests.filter((item) => item.status === filter), [filter, requests]);

  async function handleReview(item: MerchantExchangeRequest, status: 'approved' | 'rejected') {
    if (savingId) return;
    setSavingId(item.id); setError(''); setNotice('');
    try {
      const result = await reviewExchangeRequest(item.id, status, responseDrafts[item.id] || '');
      if (result.error || !result.request) { setError(result.error || 'تعذر حفظ القرار. حاول مجدداً.'); return; }
      setRequests((previous) => previous.map((request) => request.id === item.id ? { ...request, ...result.request } : request));
      setNotice(status === 'approved' ? 'تمت الموافقة على طلب الاستبدال.' : 'تم رفض طلب الاستبدال.');
    } catch { setError('تعذر الاتصال بالخادم. حدّث الصفحة ثم حاول مجدداً.'); }
    finally { setSavingId(null); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <div><span className={styles.eyebrow}>خدمات ما بعد البيع</span><h2>طلبات الاستبدال</h2><p>طلبات الزبائن بعد استلام منتجاتهم. راجع السبب وردّ بقرار واضح من مكان واحد.</p></div>
        <div className={styles.total}><strong>{counts.pending.toLocaleString('ar-DZ')}</strong><span>بانتظارك</span></div>
      </div>
      {!storageAvailable && <div className={styles.migrationNotice} role="alert">جدول طلبات الاستبدال غير متاح بعد. طبّق ملف التحديث <code>20261111_order_exchange_requests.sql</code> في قاعدة بيانات Supabase لبدء استخدام الميزة.</div>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.metrics}>
        <div><span>كل الطلبات</span><strong>{counts.all.toLocaleString('ar-DZ')}</strong></div>
        <div><span>بانتظار المراجعة</span><strong>{counts.pending.toLocaleString('ar-DZ')}</strong></div>
        <div><span>تمت الموافقة</span><strong>{counts.approved.toLocaleString('ar-DZ')}</strong></div>
        <div><span>مرفوضة</span><strong>{counts.rejected.toLocaleString('ar-DZ')}</strong></div>
      </div>
      <div className={styles.toolbar} role="tablist" aria-label="تصفية طلبات الاستبدال">
        {FILTERS.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={filter === item.value ? styles.filterActive : ''} onClick={() => setFilter(item.value)}>{item.label}<span>{counts[item.value].toLocaleString('ar-DZ')}</span></button>)}
      </div>
      {visibleRequests.length === 0 ? (
        <div className={styles.empty}><span className={styles.emptyMark} aria-hidden="true">↻</span><h3>{requests.length === 0 ? 'لا توجد طلبات استبدال بعد' : 'لا توجد طلبات في هذا القسم'}</h3><p>{requests.length === 0 ? 'ستظهر هنا طلبات الزبائن بعد تفعيل الخدمة من الإعدادات.' : 'جرّب اختيار قسم آخر لمراجعة الطلبات.'}</p></div>
      ) : (
        <div className={styles.list}>
          {visibleRequests.map((item) => {
            const reasonLabel = EXCHANGE_REQUEST_REASONS.find((reason) => reason.value === item.reason)?.label || item.reason;
            return <article key={item.id} className={styles.request}>
              <div className={styles.requestHeader}>
                <div><span className={styles.orderNumber} dir="ltr">#{item.order?.external_order_id || '—'}</span><h3>{item.order?.customer_name || 'زبون'}</h3>{item.order?.product_name && <p className={styles.product}>{item.order.product_name}</p>}</div>
                <span className={`${styles.status} ${styles[`status_${item.status}`]}`}><i />{STATUS_LABELS[item.status]}</span>
              </div>
              <div className={styles.reasonBlock}><span>سبب الاستبدال</span><strong>{reasonLabel}</strong>{item.customer_note && <p>{item.customer_note}</p>}</div>
              <div className={styles.requestMeta}>تاريخ الطلب: {new Date(item.created_at).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              {item.status === 'pending' ? <div className={styles.reviewArea}>
                <label>رد للزبون <span>اختياري</span><textarea value={responseDrafts[item.id] || ''} maxLength={500} rows={2} onChange={(event) => setResponseDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))} placeholder="اكتب توضيحاً أو الخطوة التالية..." /></label>
                <div className={styles.actions}><button type="button" className={styles.approve} disabled={savingId === item.id} onClick={() => void handleReview(item, 'approved')}>{savingId === item.id ? 'جارٍ الحفظ...' : 'الموافقة على الاستبدال'}</button><button type="button" className={styles.reject} disabled={savingId === item.id} onClick={() => void handleReview(item, 'rejected')}>رفض الطلب</button></div>
              </div> : item.merchant_response ? <div className={styles.savedResponse}><span>رد المتجر</span><p>{item.merchant_response}</p></div> : null}
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
