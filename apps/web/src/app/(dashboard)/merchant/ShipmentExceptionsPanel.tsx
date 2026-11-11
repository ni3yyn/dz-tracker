'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateShipmentExceptionState } from './actions';
import {
  detectShipmentExceptions,
  shipmentExceptionStateKey,
  type ShipmentException,
  type ShipmentExceptionOrder,
  type ShipmentExceptionState,
  type ShipmentExceptionStateValue,
} from './shipment-exceptions';
import styles from './shipment-exceptions.module.css';

type ViewState = 'open' | 'reviewed' | 'snoozed';
type CategoryFilter = 'all' | 'delivery' | 'movement' | 'returns';
interface Props {
  orders: ShipmentExceptionOrder[];
  exceptionStates: ShipmentExceptionState[];
  exceptionStateStorageAvailable: boolean;
  siteUrl: string;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onOpenOrder: (orderId: string) => void;
  getStatusLabel: (status: string) => string;
}

function formatEventDate(value: string | null): string {
  if (!value) return 'وقت الحدث غير متاح من شركة الشحن';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'وقت الحدث غير متاح من شركة الشحن';
  return date.toLocaleString('ar-DZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function whatsappHref(exception: ShipmentException, siteUrl: string): string | null {
  let phone = (exception.order.customer_phone || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '213' + phone.slice(1);
  if (!phone || phone.length < 10) return null;
  const trackingUrl = siteUrl.replace(/\/+$/, '') + '/t/' + exception.order.tracking_uuid;
  const message = 'مرحباً ' + (exception.order.customer_name || '') +
    '، نتواصل معك بخصوص طلبك ' + exception.order.external_order_id +
    ' لدى شركة التوصيل. يمكنك متابعة الشحنة من هنا: ' + trackingUrl;
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
}

export function ShipmentExceptionsPanel({
  orders, exceptionStates, exceptionStateStorageAvailable, siteUrl,
  searchTerm, onSearchTermChange, onOpenOrder, getStatusLabel,
}: Props) {
  const router = useRouter();
  const [viewState, setViewState] = useState<ViewState>('open');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [stateOverrides, setStateOverrides] = useState<Record<string, ShipmentExceptionState>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const exceptions = useMemo(() => detectShipmentExceptions(orders), [orders]);
  const stateMap = useMemo(() => {
    const result: Record<string, ShipmentExceptionState> = {};
    for (const state of exceptionStates) result[shipmentExceptionStateKey(state.order_id, state.exception_type)] = state;
    return result;
  }, [exceptionStates]);

  const getExceptionState = (exception: ShipmentException): ShipmentExceptionStateValue => {
    const key = shipmentExceptionStateKey(exception.orderId, exception.type);
    const state = stateOverrides[key] || stateMap[key];
    if (!state || state.event_fingerprint !== exception.eventFingerprint) return 'open';
    if (state.state === 'snoozed' && state.snoozed_until && Date.parse(state.snoozed_until) <= Date.now()) return 'open';
    return state.state;
  };

  const counts = useMemo(() => {
    let open = 0, reviewed = 0, snoozed = 0;
    for (const exception of exceptions) {
      const state = getExceptionState(exception);
      if (state === 'open') open += 1;
      else if (state === 'acknowledged') reviewed += 1;
      else if (state === 'snoozed') snoozed += 1;
    }
    return { open, reviewed, snoozed, total: open + reviewed + snoozed };
  }, [exceptions, stateMap, stateOverrides]);

  const visibleExceptions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return exceptions.filter((exception) => {
      const state = getExceptionState(exception);
      if (state === 'resolved') return false;
      if (viewState === 'open' && state !== 'open') return false;
      if (viewState === 'reviewed' && state !== 'acknowledged') return false;
      if (viewState === 'snoozed' && state !== 'snoozed') return false;
      if (category === 'delivery' && !['delivery_failed','delivery_postponed','out_for_delivery_stalled'].includes(exception.type)) return false;
      if (category === 'movement' && !['no_first_scan','shipment_stalled','pickup_waiting'].includes(exception.type)) return false;
      if (category === 'returns' && !['returning','returned'].includes(exception.type)) return false;
      if (!query) return true;
      return [
        exception.order.external_order_id, exception.order.customer_name,
        exception.order.customer_phone, exception.order.carrier_name,
        exception.order.carrier_tracking_number, exception.title,
      ].some((value) => (value || '').toString().toLowerCase().includes(query));
    });
  }, [exceptions, searchTerm, viewState, category, stateMap, stateOverrides]);

  const updateState = async (exception: ShipmentException, nextState: ShipmentExceptionStateValue) => {
    const key = shipmentExceptionStateKey(exception.orderId, exception.type);
    setSavingKey(key);
    setErrorMessage(null);
    try {
      const result = await updateShipmentExceptionState(exception.orderId, exception.type, nextState, exception.eventFingerprint);
      if (!result?.success) {
        setErrorMessage(result?.error || 'تعذر حفظ إجراء الاستثناء.');
        return;
      }
      setStateOverrides((previous) => ({
        ...previous,
        [key]: {
          order_id: exception.orderId,
          exception_type: exception.type,
          state: nextState,
          event_fingerprint: exception.eventFingerprint,
          snoozed_until: nextState === 'snoozed' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        },
      }));
      router.refresh();
    } catch {
      setErrorMessage('تعذر الاتصال أثناء حفظ الإجراء. حاول مجدداً.');
    } finally {
      setSavingKey(null);
    }
  };

  const copyTrackingLink = async (exception: ShipmentException) => {
    const link = siteUrl.replace(/\/+$/, '') + '/t/' + exception.order.tracking_uuid;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedOrderId(exception.orderId);
    } catch {
      setErrorMessage('تعذر نسخ رابط التتبع من هذا المتصفح.');
    }
  };

  const views: Array<{ value: ViewState; label: string; count: number }> = [
    { value: 'open', label: 'تحتاج إجراء', count: counts.open },
    { value: 'reviewed', label: 'تمت مراجعتها', count: counts.reviewed },
    { value: 'snoozed', label: 'مؤجلة', count: counts.snoozed },
  ];

  return (
    <section className={styles.root} dir="rtl" aria-label="استثناءات الشحن">
      {!exceptionStateStorageAvailable && (
        <div className={styles.migrationNotice} role="status">
          لم يتم تفعيل حفظ إجراءات الاستثناءات بعد. طبّق ترحيل قاعدة البيانات الخاص باستثناءات الشحن لتفعيل المراجعة والتأجيل والحل.
        </div>
      )}
      <div className={styles.summary}>
        <div className={styles.summaryIntro}>
          <span className={styles.eyebrow}>مراقبة الشحنات</span>
          <h2>ما يحتاج إلى تدخلك الآن</h2>
          <p>تظهر هنا المشكلات المدعومة بحالة شركة التوصيل أو وقت آخر حدث مؤكد، دون تقدير موقع الشحنة.</p>
        </div>
        <div className={styles.total}><strong>{counts.total}</strong><span>استثناء نشط</span></div>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.views} role="tablist" aria-label="حالة الاستثناء">
          {views.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={viewState === item.value}
              className={viewState === item.value ? styles.viewActive : styles.viewButton}
              onClick={() => setViewState(item.value)}>
              {item.label}<span>{item.count}</span>
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <select aria-label="تصفية نوع الاستثناء" value={category}
            onChange={(event) => setCategory(event.target.value as CategoryFilter)}>
            <option value="all">كل الحالات</option>
            <option value="delivery">مشاكل التوصيل</option>
            <option value="movement">توقف الحركة</option>
            <option value="returns">الإرجاع</option>
          </select>
          <input type="search" aria-label="البحث في الاستثناءات"
            placeholder="رقم الطلب، الزبون أو شركة الشحن..."
            value={searchTerm} onChange={(event) => onSearchTermChange(event.target.value)} />
        </div>
      </div>
      {errorMessage && <div className={styles.error} role="alert">{errorMessage}</div>}
      {visibleExceptions.length === 0 ? (
        <div className={styles.empty}>
          <strong>{viewState === 'open' ? 'لا توجد استثناءات تحتاج إلى إجراء' : viewState === 'reviewed' ? 'لا توجد استثناءات تمت مراجعتها' : 'لا توجد استثناءات مؤجلة'}</strong>
          <span>{viewState === 'open' ? 'ستظهر هنا فقط المشكلات التي تدعمها حالة الشحنة أو وقت آخر حدث مؤكد.' : 'ستظهر الحالات هنا عند استخدام إجراءات المراجعة أو التأجيل.'}</span>
        </div>
      ) : (
        <div className={styles.list}>
          {visibleExceptions.map((exception) => {
            const key = shipmentExceptionStateKey(exception.orderId, exception.type);
            const currentState = getExceptionState(exception);
            const phoneLink = whatsappHref(exception, siteUrl);
            const isSaving = savingKey === key;
            return (
              <article key={exception.id} className={styles.item} data-severity={exception.severity}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHeading}>
                    <span className={styles.severity} data-severity={exception.severity}>{exception.severity === 'critical' ? 'عاجل' : 'متابعة'}</span>
                    <strong>{exception.title}</strong>
                    {currentState === 'acknowledged' && <span className={styles.stateLabel}>تمت المراجعة</span>}
                    {currentState === 'snoozed' && <span className={styles.stateLabel}>مؤجل حتى انتهاء المهلة</span>}
                  </div>
                  <p className={styles.description}>{exception.description}</p>
                  <div className={styles.meta}>
                    <strong>{exception.order.external_order_id}</strong>
                    <span>{exception.order.customer_name || 'زبون غير محدد'}</span>
                    <span>{exception.order.carrier_name || 'شركة شحن غير محددة'}</span>
                    <span>الحالة: {getStatusLabel(exception.order.current_status)}</span>
                    <span>آخر تحديث مؤكد: {formatEventDate(exception.lastEventAt)}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={() => onOpenOrder(exception.orderId)} className={styles.primaryAction}>فتح الشحنة</button>
                  {phoneLink && <a href={phoneLink} target="_blank" rel="noreferrer" className={styles.actionLink}>مراسلة الزبون</a>}
                  <button type="button" onClick={() => void copyTrackingLink(exception)} className={styles.actionLink}>
                    {copiedOrderId === exception.orderId ? 'تم النسخ' : 'نسخ رابط التتبع'}
                  </button>
                  {currentState === 'open' && <>
                    <button type="button" disabled={isSaving || !exceptionStateStorageAvailable} onClick={() => void updateState(exception, 'acknowledged')} className={styles.actionLink}>تمت المراجعة</button>
                    <button type="button" disabled={isSaving || !exceptionStateStorageAvailable} onClick={() => void updateState(exception, 'snoozed')} className={styles.actionLink}>تأجيل 24 ساعة</button>
                    <button type="button" disabled={isSaving || !exceptionStateStorageAvailable} onClick={() => void updateState(exception, 'resolved')} className={styles.resolveAction}>تم الحل</button>
                  </>}
                  {currentState === 'acknowledged' && <>
                    <button type="button" disabled={isSaving || !exceptionStateStorageAvailable} onClick={() => void updateState(exception, 'open')} className={styles.actionLink}>إعادة فتح</button>
                    <button type="button" disabled={isSaving || !exceptionStateStorageAvailable} onClick={() => void updateState(exception, 'resolved')} className={styles.resolveAction}>تم الحل</button>
                  </>}
                  {currentState === 'snoozed' && <button type="button" disabled={isSaving || !exceptionStateStorageAvailable} onClick={() => void updateState(exception, 'open')} className={styles.actionLink}>إلغاء التأجيل</button>}
                  {isSaving && <span className={styles.saving}>جارٍ الحفظ...</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
