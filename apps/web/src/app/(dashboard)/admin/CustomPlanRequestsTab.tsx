'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCustomPlanRequest } from './actions';
import styles from './admin.module.css';
import { BrandedSelect } from '../merchant/BrandedSelect';
import { AdminDataTable } from './AdminDataTable';

export interface CustomPlanRequestItem {
  id: string;
  full_name: string;
  store_name: string;
  contact_phone: string;
  preferred_contact_method: 'whatsapp' | 'phone';
  monthly_tracking_urls: number;
  carrier_names: string | null;
  requirements: string | null;
  status: 'new' | 'contacted' | 'quoted' | 'closed';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS: { value: CustomPlanRequestItem['status']; label: string }[] = [
  { value: 'new', label: 'جديد' },
  { value: 'contacted', label: 'تم التواصل' },
  { value: 'quoted', label: 'تم إرسال العرض' },
  { value: 'closed', label: 'مغلق' },
];

function formatPhoneForWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('213')) return digits;
  if (digits.startsWith('0')) return '213' + digits.slice(1);
  return digits;
}

export default function CustomPlanRequestsTab({
  requests: initialRequests,
  loadError,
}: {
  requests: CustomPlanRequestItem[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const refreshRequests = () => {
    startRefresh(() => router.refresh());
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>, requestId: string) => {
    event.preventDefault();
    if (savingId) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('request_id', requestId);
    setSavingId(requestId);
    setFeedback(null);

    try {
      const result = await updateCustomPlanRequest(formData);
      if (result.error) {
        setFeedback(result.error);
        return;
      }

      const nextStatus = String(formData.get('status')) as CustomPlanRequestItem['status'];
      const nextNotes = String(formData.get('admin_notes') || '').trim() || null;
      setRequests((current) => current.map((request) =>
        request.id === requestId
          ? { ...request, status: nextStatus, admin_notes: nextNotes, updated_at: new Date().toISOString() }
          : request
      ));
      setFeedback('تم حفظ تحديث الطلب.');
    } catch {
      setFeedback('تعذر حفظ التحديث. حدّث الصفحة وحاول مجدداً.');
    } finally {
      setSavingId(null);
    }
  };

  if (loadError) {
    return (
      <div className={styles.card} style={{ padding: '28px 22px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>تعذر تحميل طلبات الباقات المخصصة</h3>
        <p role="alert" style={{ margin: '0 0 14px', color: '#9a3528', fontSize: '12px', lineHeight: 1.8 }}>
          {loadError}
        </p>
        <button type="button" className={styles.btn} onClick={refreshRequests} disabled={isRefreshing}>
          {isRefreshing ? 'جارٍ التحديث...' : 'إعادة المحاولة'}
        </button>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className={styles.card} style={{ padding: '48px 22px', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>لا توجد طلبات باقات مخصصة بعد</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--ink-muted)', fontSize: '12px' }}>
          ستظهر هنا طلبات عروض الأسعار التي يرسلها العملاء من صفحة الأسعار.
        </p>
        <button type="button" className={styles.btn} onClick={refreshRequests} disabled={isRefreshing}>
          {isRefreshing ? 'جارٍ التحديث...' : 'تحديث القائمة'}
        </button>
      </div>
    );
  }

  return (
    <section>


      {feedback && (
        <p role="status" style={{ margin: '0 0 12px', color: 'var(--ink-main)', fontSize: '12px' }}>
          {feedback}
        </p>
      )}

<AdminDataTable
  header={
    <div className={styles.tableHeader}>
      <div>
        <h3>طلبات عروض الأسعار ({requests.length})</h3>
        <span style={{ color: 'var(--ink-muted)', fontSize: '11px' }}>
          الجديدة: {requests.filter((request) => request.status === 'new').length}
        </span>
      </div>
      <button type="button" className={styles.btn} onClick={refreshRequests} disabled={isRefreshing}>
        {isRefreshing ? 'جارٍ التحديث...' : 'تحديث'}
      </button>
    </div>
  }
  columns={['العميل والمتجر', 'التواصل', 'الحجم الشهري', 'الاحتياجات', 'تاريخ الطلب', 'المتابعة']}
>
        {requests.map((request) => {
          const whatsappPhone = formatPhoneForWhatsApp(request.contact_phone);
          const whatsappMessage = 'مرحباً ' + request.full_name + '، تواصلنا معك بخصوص طلب الخطة المخصصة لمتجر ' + request.store_name + ' على تاجر تراك.';
          return (
            <tr key={request.id}>
              <td data-label="العميل والمتجر">
                <strong style={{ display: 'block', color: 'var(--ink-main)' }}>{request.full_name}</strong>
                <span style={{ display: 'block', marginTop: '3px', color: 'var(--ink-muted)', fontSize: '11px' }}>{request.store_name}</span>
              </td>
              <td data-label="التواصل">
                <span className={styles.mono} style={{ display: 'block', direction: 'ltr', textAlign: 'right' }}>{request.contact_phone}</span>
                <span style={{ display: 'block', marginTop: '5px', color: 'var(--ink-muted)', fontSize: '10px' }}>
                  {request.preferred_contact_method === 'whatsapp' ? 'واتساب مفضّل' : 'مكالمة مفضّلة'}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '8px' }}>
                  <a href={'https://wa.me/' + whatsappPhone + '?text=' + encodeURIComponent(whatsappMessage)} target="_blank" rel="noreferrer" style={{ color: 'var(--ink-main)', fontSize: '11px', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}>فتح واتساب</a>
                  <a href={'tel:' + request.contact_phone} style={{ color: 'var(--ink-muted)', fontSize: '11px', textDecoration: 'underline', textUnderlineOffset: '3px' }}>اتصال</a>
                </div>
              </td>
              <td data-label="الحجم الشهري">
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{request.monthly_tracking_urls.toLocaleString('en-US')}</strong>
                <span style={{ display: 'block', color: 'var(--ink-muted)', fontSize: '10px' }}>رابط تتبّع</span>
              </td>
              <td data-label="الاحتياجات" style={{ minWidth: '180px', maxWidth: '260px', whiteSpace: 'normal' }}>
                {request.carrier_names && <span style={{ display: 'block', color: 'var(--ink-main)', fontSize: '11px' }}>النواقل: {request.carrier_names}</span>}
                {request.requirements && <p style={{ margin: request.carrier_names ? '5px 0 0' : 0, color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.7 }}>{request.requirements}</p>}
                {!request.carrier_names && !request.requirements && <span style={{ color: 'var(--ink-light)' }}>—</span>}
              </td>
              <td data-label="تاريخ الطلب">
                <span style={{ whiteSpace: 'nowrap', fontSize: '11px' }}>{new Date(request.created_at).toLocaleString('ar-DZ')}</span>
              </td>
              <td data-label="المتابعة" style={{ minWidth: '210px' }}>
                <form onSubmit={(event) => void handleSave(event, request.id)}>
                  <BrandedSelect
                    name="status"
                    defaultValue={request.status}
                    options={STATUS_OPTIONS}
                    ariaLabel={`حالة متابعة طلب ${request.full_name}`}
                    variant="field"
                    borderRadius="0"
                    className={styles.adminBrandedSelect}
                  />
                  <textarea name="admin_notes" defaultValue={request.admin_notes || ''} rows={2} maxLength={1500} className={styles.input} placeholder="ملاحظات التفاوض والسعر..." style={{ minHeight: '54px', marginBottom: '7px', padding: '7px 8px', fontSize: '11px', resize: 'vertical' }} />
                  <button type="submit" className={styles.btn} disabled={savingId === request.id} style={{ minHeight: '34px', padding: '0 12px', fontSize: '11px', opacity: savingId === request.id ? .65 : 1 }}>
                    {savingId === request.id ? 'جارٍ الحفظ...' : 'حفظ المتابعة'}
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
  
</AdminDataTable>
    </section>
  );
}
