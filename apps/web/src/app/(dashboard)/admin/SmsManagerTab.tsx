'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  retrySmsTrackingJob,
  setSmsGatewayEnabled,
  setSmsGatewayDeviceEnabled,
} from './actions';
import styles from './sms-manager.module.css';
import { DashboardFilterTabs } from '../merchant/components/DashboardFilterTabs';

type Related<T> = T | T[] | null | undefined;

type SmsJob = {
  id: string;
  order_id: string;
  merchant_id: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  locked_by: string | null;
  locked_at: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  result_code: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  orders?: Related<{ external_order_id: string | null; customer_name: string | null; customer_phone: string | null }>;
  merchants?: Related<{ store_name: string | null }>;
};

type SmsAttempt = {
  id: string;
  job_id: string;
  attempt_number: number;
  outcome: string;
  error_message: string | null;
  created_at: string;
};

type SmsAdminEvent = {
  id: string;
  job_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type SmsManagerData = {
  ready: boolean;
  setupError?: string | null;
  control: { enabled: boolean; updated_at: string | null } | null;
  device: {
    device_id: string;
    display_name: string;
    enabled: boolean;
    last_seen_at: string | null;
    last_claim_at: string | null;
    last_result_at: string | null;
    last_status: string | null;
    last_error: string | null;
  } | null;
  jobs: SmsJob[];
  attempts: SmsAttempt[];
  events: SmsAdminEvent[];
  counts: Record<string, number>;
};

type Props = { data: SmsManagerData };

const STATUS_LABELS: Record<string, string> = {
  pending: 'في الانتظار',
  processing: 'قيد الإرسال',
  retry: 'إعادة المحاولة',
  submitted: 'أُرسل إلى أندرويد',
  failed: 'فشل',
  unknown: 'نتيجة غير معروفة',
  skipped: 'تم التخطي',
  dead_letter: 'تجاوز المحاولات',
};

const STATUS_FILTERS = [
  ['all', 'الكل'],
  ['pending', 'في الانتظار'],
  ['processing', 'قيد الإرسال'],
  ['retry', 'إعادة المحاولة'],
  ['submitted', 'مُرسل'],
  ['failed', 'فشل'],
  ['unknown', 'غير معروف'],
  ['dead_letter', 'تجاوز المحاولات'],
  ['skipped', 'تم التخطي'],
] as const;

function related<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-DZ');
}

function maskPhone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return '••••';
  return value.slice(0, Math.min(5, value.length)) + '••••' + value.slice(-3);
}

function gatewayFreshness(lastSeen: string | null | undefined): { label: string; tone: string } {
  if (!lastSeen) return { label: 'لم يتصل بعد', tone: 'offline' };
  const age = Date.now() - new Date(lastSeen).getTime();
  if (!Number.isFinite(age) || age > 180_000) return { label: 'غير متصل', tone: 'offline' };
  if (age > 45_000) return { label: 'اتصال متأخر', tone: 'warning' };
  return { label: 'متصل', tone: 'online' };
}

function statusTone(status: string): string {
  if (status === 'submitted') return 'success';
  if (status === 'pending' || status === 'retry' || status === 'processing') return 'active';
  if (status === 'unknown' || status === 'dead_letter' || status === 'failed') return 'danger';
  return 'muted';
}

export default function SmsManagerTab({ data: initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [liveState, setLiveState] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const refreshInFlight = useRef(false);

  const refreshData = useCallback(async () => {
    if (refreshInFlight.current || document.visibilityState === 'hidden') return;
    refreshInFlight.current = true;
    try {
      const response = await fetch('/api/admin/sms-gateway', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error('SMS snapshot request failed');
      const nextData = await response.json() as SmsManagerData;
      if (!nextData?.ready) throw new Error('SMS snapshot is not ready');
      setData(nextData);
      setLastRefreshAt(new Date());
      setLiveState('live');
    } catch {
      // Keep the last good snapshot visible and show a reconnecting state.
      setLiveState('reconnecting');
    } finally {
      refreshInFlight.current = false;
    }
  }, []);
  const [filter, setFilter] = useState<string>('all');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<SmsJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!retryTarget) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setRetryTarget(null);
    };
    document.addEventListener('keydown', dismissOnEscape, true);
    return () => document.removeEventListener('keydown', dismissOnEscape, true);
  }, [retryTarget]);

  useEffect(() => {
    void refreshData();

    // Near-live updates: poll every 3 seconds while this tab is visible.
    // Avoid background traffic and overlapping snapshot requests.
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshData();
    }, 3_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshData();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshData]);

  const filteredJobs = useMemo(
    () => filter === 'all' ? data.jobs : data.jobs.filter((job) => job.status === filter),
    [data.jobs, filter],
  );

  const attemptsByJob = useMemo(() => {
    const map = new Map<string, SmsAttempt[]>();
    for (const attempt of data.attempts) {
      const list = map.get(attempt.job_id) || [];
      list.push(attempt);
      map.set(attempt.job_id, list);
    }
    return map;
  }, [data.attempts]);

  const freshness = gatewayFreshness(data.device?.last_seen_at);
  const queued = (data.counts.pending || 0) + (data.counts.retry || 0);
  const needsReview = (data.counts.unknown || 0) + (data.counts.dead_letter || 0) + (data.counts.failed || 0);

  async function runAction(key: string, action: () => Promise<{ error?: string; success?: boolean }>, successText: string) {
    setBusy(key);
    setNotice(null);
    try {
      const result = await action();
      if (result?.error) {
        setNotice({ type: 'error', text: result.error });
      } else {
        setNotice({ type: 'success', text: successText });
        await refreshData();
      }
    } catch {
      setNotice({ type: 'error', text: 'تعذر تنفيذ الإجراء. تحقق من الاتصال ثم أعد المحاولة.' });
    } finally {
      setBusy(null);
    }
  }

  function toggleGateway(enabled: boolean) {
    const form = new FormData();
    form.set('enabled', String(enabled));
    return runAction('gateway', () => setSmsGatewayEnabled(form), enabled ? 'تم تشغيل بوابة SMS.' : 'تم إيقاف إرسال SMS مؤقتاً.');
  }

  function toggleDevice(enabled: boolean) {
    const form = new FormData();
    form.set('device_id', data.device?.device_id || 'android-sms-gateway');
    form.set('enabled', String(enabled));
    return runAction('device', () => setSmsGatewayDeviceEnabled(form), enabled ? 'تم تفعيل الجهاز.' : 'تم تعطيل الجهاز.');
  }

  function confirmRetry() {
    if (!retryTarget) return;
    const target = retryTarget;
    const form = new FormData();
    form.set('job_id', target.id);
    form.set('force_unknown', String(target.status === 'unknown'));
    void runAction(
      'retry:' + target.id,
      () => retrySmsTrackingJob(form),
      'أُعيدت إضافة الرسالة إلى قائمة الإرسال.',
    );
    setRetryTarget(null);
  }

  if (!data.ready) {
    return (
      <div className={styles.root}>
        <div className={styles.setupWarning}>
          <strong>إعداد مدير SMS غير مكتمل</strong>
          <p>{data.setupError || 'تعذر قراءة جداول إدارة SMS.'}</p>
          <p>طبّق ملف الترحيل <code>20261112_sms_gateway_admin_manager.sql</code> في Supabase، ثم حدّث هذه الصفحة.</p>
        </div>
      </div>
    );
  }

  return (
    <section className={styles.root} dir="rtl" aria-label="إدارة رسائل SMS">
      {notice && (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError} role="status">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="إغلاق">×</button>
        </div>
      )}

      <div className={styles.healthStrip}>
        <div className={styles.healthMain}>
          <span className={styles.eyebrow}>SMS GATEWAY / OPERATIONS</span>
          <div className={styles.healthTitleRow}>
            <h2>حالة بوابة الرسائل</h2>
            <span className={styles.healthStatus} data-tone={freshness.tone}>
              <i />{freshness.label}
            </span>
          </div>
          <p>
            {data.device?.display_name || 'بوابة Android SIM'}
            <span>آخر اتصال: {formatDate(data.device?.last_seen_at)}</span>
          </p>
        </div>
        <div className={styles.healthActions}>
          <div className={styles.switchCopy}>
            <strong>{data.control?.enabled ? 'الإرسال العام مفعّل' : 'الإرسال العام متوقف'}</strong>
            <small>إيقاف البوابة يمنع الأجهزة من استلام رسائل جديدة؛ ولا يحذف الرسائل المعلّقة.</small>
          </div>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={busy !== null || !data.control}
            onClick={() => void toggleGateway(!data.control?.enabled)}
          >
            {busy === 'gateway' ? 'جارٍ التحديث…' : data.control?.enabled ? 'إيقاف الإرسال' : 'استئناف الإرسال'}
          </button>
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}><span>قائمة الانتظار</span><strong>{queued.toLocaleString('ar-DZ')}</strong><small>رسائل تنتظر الإرسال أو إعادة المحاولة</small></div>
        <div className={styles.metric}><span>قيد المعالجة</span><strong>{(data.counts.processing || 0).toLocaleString('ar-DZ')}</strong><small>رسائل محجوزة بواسطة البوابة</small></div>
        <div className={styles.metric}><span>تم الإرسال</span><strong>{(data.counts.submitted || 0).toLocaleString('ar-DZ')}</strong><small>إجمالي ما قبله Android</small></div>
        <div className={styles.metric} data-alert={needsReview > 0 ? 'true' : 'false'}><span>تحتاج مراجعة</span><strong>{needsReview.toLocaleString('ar-DZ')}</strong><small>نتيجة مجهولة أو رسائل استنفدت المحاولات</small></div>
        <div className={styles.metric}><span>تم التخطي</span><strong>{(data.counts.skipped || 0).toLocaleString('ar-DZ')}</strong><small>رقم غير صالح أو إعداد التاجر متوقف</small></div>
      </div>

      <div className={styles.devicePanel}>
        <div>
          <span className={styles.eyebrow}>SENDING DEVICE</span>
          <h3>{data.device?.display_name || 'Primary Android SIM gateway'}</h3>
          <p>آخر طلب من الجهاز: {formatDate(data.device?.last_seen_at)} · آخر نتيجة: {formatDate(data.device?.last_result_at)}</p>
          {data.device?.last_error && <p className={styles.deviceError}>آخر خطأ: {data.device.last_error}</p>}
          {data.device?.last_status && <p>آخر حالة مرسلة: {STATUS_LABELS[data.device.last_status] || data.device.last_status}</p>}
        </div>
        <div className={styles.deviceActions}>
          <span className={data.device?.enabled ? styles.deviceEnabled : styles.deviceDisabled}>
            {data.device?.enabled ? 'الجهاز مسموح له بالإرسال' : 'الجهاز معطّل'}
          </span>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={busy !== null || !data.device}
            onClick={() => void toggleDevice(!data.device?.enabled)}
          >
            {busy === 'device' ? 'جارٍ التحديث…' : data.device?.enabled ? 'تعطيل الجهاز' : 'تفعيل الجهاز'}
          </button>
        </div>
      </div>

      <div className={styles.queuePanel}>
        <div className={styles.sectionHeader}>
          <div><span className={styles.eyebrow}>OUTBOX / DELIVERY LOG</span><h3>قائمة الرسائل وسجل الإرسال</h3></div>
          <span className={styles.sectionMeta} data-live={liveState}><i />{liveState === 'live' ? 'مزامنة مباشرة' : liveState === 'connecting' ? 'جارٍ الاتصال…' : 'إعادة الاتصال…'} · آخر تحديث {lastRefreshAt ? lastRefreshAt.toLocaleTimeString('ar-DZ') : '—'}</span>
        </div>
        <DashboardFilterTabs
          className={styles.filters}
          ariaLabel="تصفية رسائل SMS"
          items={STATUS_FILTERS.map(([value, label]) => ({
            value,
            label,
            count: value !== 'all' ? (data.counts[value] || 0).toLocaleString('ar-DZ') : undefined,
            active: filter === value,
            onSelect: () => setFilter(value),
          }))}
        />

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>الطلب</th><th>المتجر</th><th>رقم العميل</th><th>الحالة</th><th>المحاولات</th><th>آخر تحديث</th><th>الإجراء</th></tr></thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>لا توجد رسائل ضمن هذا التصنيف.</td></tr>
              ) : filteredJobs.map((job) => {
                const order = related(job.orders);
                const merchant = related(job.merchants);
                const attempts = attemptsByJob.get(job.id) || [];
                const canRetry = ['failed', 'dead_letter', 'unknown'].includes(job.status);
                return (
                  <Fragment key={job.id}>
                    <tr className={expandedJob === job.id ? styles.expandedRow : undefined}>
                      <td>
                        <button type="button" className={styles.orderButton} onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                          {order?.external_order_id || job.order_id.slice(0, 8)}
                          <small>{order?.customer_name || 'طلب'}</small>
                        </button>
                      </td>
                      <td>{merchant?.store_name || '—'}</td>
                      <td className={styles.phone}>{maskPhone(order?.customer_phone)}</td>
                      <td><span className={styles.status} data-tone={statusTone(job.status)}>{STATUS_LABELS[job.status] || job.status}</span></td>
                      <td className={styles.number}>{job.attempt_count} / {job.max_attempts}</td>
                      <td>{formatDate(job.updated_at)}</td>
                      <td>
                        {canRetry ? (
                          <button type="button" className={styles.retryButton} disabled={busy !== null} onClick={() => setRetryTarget(job)}>
                            إعادة المعالجة
                          </button>
                        ) : (
                          <button type="button" className={styles.detailButton} onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                            {expandedJob === job.id ? 'إخفاء التفاصيل' : 'التفاصيل'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedJob === job.id && (
                      <tr>
                        <td colSpan={7} className={styles.detailsCell}>
                          <div className={styles.detailsGrid}>
                            <div><span>معرّف الطلب</span><code>{job.order_id}</code></div>
                            <div><span>وقت الإنشاء</span><strong>{formatDate(job.created_at)}</strong></div>
                            <div><span>وقت الإرسال</span><strong>{formatDate(job.submitted_at)}</strong></div>
                            <div><span>رمز النتيجة</span><code>{job.result_code || '—'}</code></div>
                            <div><span>الخطأ الأخير</span><strong>{job.last_error || '—'}</strong></div>
                            <div><span>انتهاء الحجز</span><strong>{formatDate(job.lease_expires_at)}</strong></div>
                          </div>
                          <div className={styles.attempts}>
                            <strong>سجل المحاولات</strong>
                            {attempts.length ? attempts.map((attempt) => (
                              <div key={attempt.id} className={styles.attemptRow}>
                                <span>المحاولة {attempt.attempt_number}</span>
                                <span className={styles.status} data-tone={statusTone(attempt.outcome)}>{STATUS_LABELS[attempt.outcome] || attempt.outcome}</span>
                                <span>{formatDate(attempt.created_at)}</span>
                                {attempt.error_message && <small>{attempt.error_message}</small>}
                              </div>
                            )) : <p>لا توجد نتائج مُسجلة للمحاولات حتى الآن.</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.auditPanel}>
        <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>ADMIN AUDIT</span><h3>سجل إجراءات الإدارة</h3></div></div>
        {data.events.length ? data.events.slice(0, 20).map((event) => (
          <div key={event.id} className={styles.auditRow}>
            <span>{event.action === 'retry_job' ? 'إعادة محاولة رسالة' : event.action === 'force_retry_unknown' ? 'إعادة إرسال نتيجة مجهولة' : event.action === 'pause_gateway' ? 'إيقاف بوابة SMS' : event.action === 'resume_gateway' ? 'استئناف بوابة SMS' : event.action === 'disable_device' ? 'تعطيل جهاز' : 'تفعيل جهاز'}</span>
            <code>{event.job_id ? event.job_id.slice(0, 8) : '—'}</code>
            <small>{formatDate(event.created_at)}</small>
          </div>
        )) : <p className={styles.emptyAudit}>لم تُسجّل إجراءات إدارية بعد.</p>}
      </div>

      {retryTarget && (
        <div data-dashboard-back-dismiss="admin-sms-retry" className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRetryTarget(null); }}>
          <section className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="sms-retry-title">
            <span className={styles.eyebrow}>MANUAL RETRY</span>
            <h3 id="sms-retry-title">{retryTarget.status === 'unknown' ? 'إعادة إرسال نتيجة غير معروفة؟' : 'إعادة إدراج الرسالة؟'}</h3>
            {retryTarget.status === 'unknown' ? (
              <p>لا يمكن معرفة ما إذا كان الهاتف قد أرسل الرسالة بالفعل. إعادة المحاولة قد تُوصل رسالة مكررة للعميل. تابع فقط بعد التحقق من سجل الهاتف أو التواصل مع العميل.</p>
            ) : (
              <p>ستُعاد الرسالة إلى قائمة الانتظار مع الاحتفاظ بسجل المحاولات السابقة وإضافة محاولات جديدة مسموحة.</p>
            )}
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryAction} onClick={() => setRetryTarget(null)}>إلغاء</button>
              <button type="button" className={styles.primaryAction} disabled={busy !== null} onClick={confirmRetry}>
                {busy === 'retry:' + retryTarget.id ? 'جارٍ التنفيذ…' : 'تأكيد إعادة المعالجة'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
