'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './supabase-usage.module.css';

type UsageBucket = {
  timestamp: string;
  total_auth_requests: number;
  total_realtime_requests: number;
  total_rest_requests: number;
  total_storage_requests: number;
};

type DatabaseSize = {
  bytes: string;
  pretty: string;
  measuredAt: string;
  source: 'pg_database_size';
};

type UsageSnapshot = {
  configured?: boolean;
  missing?: string[];
  projectRef?: string | null;
  planTier?: string | null;
  interval?: '1day';
  buckets?: UsageBucket[];
  fetchedAt?: string;
  databaseSize?: DatabaseSize | null;
  databaseSizeError?: string | null;
  cached?: boolean;
  error?: string;
};

type EgressEntry = {
  uncachedGb: string;
  cachedGb: string;
  periodStart: string;
  periodEnd: string;
  capturedAt: string;
};

type Quota = { label: string; amount: string; scope: string };

const EGRESS_STORAGE_KEY = 'tajertrack-admin-supabase-egress-v1';
const EMPTY_EGRESS: EgressEntry = {
  uncachedGb: '',
  cachedGb: '',
  periodStart: '',
  periodEnd: '',
  capturedAt: '',
};

const QUOTAS: Record<string, Quota[]> = {
  free: [
    { label: 'Egress غير مخزّن مؤقتاً', amount: '5 GB', scope: 'على مستوى المؤسسة' },
    { label: 'Cached Egress', amount: '5 GB', scope: 'على مستوى المؤسسة' },
    { label: 'حجم قاعدة البيانات', amount: '500 MB', scope: 'لكل مشروع' },
    { label: 'مساحة Storage', amount: '1 GB', scope: 'على مستوى المؤسسة' },
    { label: 'المستخدمون النشطون شهرياً (MAU)', amount: '50,000', scope: 'على مستوى المؤسسة' },
    { label: 'استدعاءات Edge Functions', amount: '500,000', scope: 'على مستوى المؤسسة' },
    { label: 'رسائل Realtime', amount: '2,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'ذروة اتصالات Realtime', amount: '200', scope: 'على مستوى المؤسسة' },
  ],
  pro: [
    { label: 'Egress غير مخزّن مؤقتاً', amount: '250 GB', scope: 'على مستوى المؤسسة' },
    { label: 'Cached Egress', amount: '250 GB', scope: 'على مستوى المؤسسة' },
    { label: 'مساحة القرص للمشروع', amount: '8 GB', scope: 'لكل مشروع' },
    { label: 'مساحة Storage', amount: '100 GB', scope: 'على مستوى المؤسسة' },
    { label: 'المستخدمون النشطون شهرياً (MAU)', amount: '100,000', scope: 'على مستوى المؤسسة' },
    { label: 'استدعاءات Edge Functions', amount: '2,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'رسائل Realtime', amount: '5,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'ذروة اتصالات Realtime', amount: '500', scope: 'على مستوى المؤسسة' },
  ],
  team: [
    { label: 'Egress غير مخزّن مؤقتاً', amount: '250 GB', scope: 'على مستوى المؤسسة' },
    { label: 'Cached Egress', amount: '250 GB', scope: 'على مستوى المؤسسة' },
    { label: 'مساحة القرص للمشروع', amount: '8 GB', scope: 'لكل مشروع' },
    { label: 'مساحة Storage', amount: '100 GB', scope: 'على مستوى المؤسسة' },
    { label: 'المستخدمون النشطون شهرياً (MAU)', amount: '100,000', scope: 'على مستوى المؤسسة' },
    { label: 'استدعاءات Edge Functions', amount: '2,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'رسائل Realtime', amount: '5,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'ذروة اتصالات Realtime', amount: '500', scope: 'على مستوى المؤسسة' },
  ],
};

const SERVICES = [
  { key: 'total_rest_requests' as const, label: 'REST / Database' },
  { key: 'total_auth_requests' as const, label: 'Auth' },
  { key: 'total_realtime_requests' as const, label: 'Realtime' },
  { key: 'total_storage_requests' as const, label: 'Storage' },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
}

function normalizeTier(value: string | null | undefined): string | null {
  if (!value) return null;
  const tier = value.trim().toLowerCase();
  return ['free', 'pro', 'team', 'enterprise'].includes(tier) ? tier : null;
}

function numericInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function SupabaseUsageTab() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [egress, setEgress] = useState<EgressEntry>(EMPTY_EGRESS);
  const [egressLoaded, setEgressLoaded] = useState(false);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);
    try {
      const response = await fetch('/api/admin/supabase-usage', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const body = await response.json() as UsageSnapshot;
      setSnapshot(body);
      if (!response.ok) throw new Error(body.error || 'تعذر جلب استهلاك Supabase.');
      setError(body.error || null);
      setLastChecked(new Date());
    } catch (cause: any) {
      setError(cause?.message || 'تعذر الاتصال بخدمة مراقبة الاستهلاك.');
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EGRESS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<EgressEntry>;
        setEgress({ ...EMPTY_EGRESS, ...parsed });
      }
    } catch {
      // A malformed local entry should never prevent the admin page from loading.
    }
    setEgressLoaded(true);
  }, []);

  useEffect(() => {
    if (!egressLoaded) return;
    try {
      window.localStorage.setItem(EGRESS_STORAGE_KEY, JSON.stringify(egress));
    } catch {
      // Storage may be unavailable in private browsing; copying still works.
    }
  }, [egress, egressLoaded]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const buckets = snapshot?.buckets || [];
  const totals = useMemo(() => buckets.reduce((sum, bucket) => {
    sum.rest += bucket.total_rest_requests;
    sum.auth += bucket.total_auth_requests;
    sum.realtime += bucket.total_realtime_requests;
    sum.storage += bucket.total_storage_requests;
    return sum;
  }, { rest: 0, auth: 0, realtime: 0, storage: 0 }), [buckets]);
  const allRequests = totals.rest + totals.auth + totals.realtime + totals.storage;
  const maxDailyRequests = Math.max(1, ...buckets.map((bucket) =>
    bucket.total_rest_requests + bucket.total_auth_requests + bucket.total_realtime_requests + bucket.total_storage_requests
  ));
  const tier = normalizeTier(snapshot?.planTier);
  const quotaRows = tier && tier !== 'enterprise' ? QUOTAS[tier] : [];

  const copyAuditReport = useCallback(async () => {
    const capturedAt = new Date().toISOString();
    const uncached = numericInput(egress.uncachedGb);
    const cached = numericInput(egress.cachedGb);
    const monthlyEgressTotal = uncached !== null && cached !== null ? uncached + cached : null;
    const requestStart = buckets[0]?.timestamp || 'غير متاح';
    const requestEnd = buckets[buckets.length - 1]?.timestamp || 'غير متاح';
    const database = snapshot?.databaseSize;
    const lines = [
      'TAJERTRACK — SUPABASE USAGE AUDIT',
      `Report copied at (UTC): ${capturedAt}`,
      `Project ref: ${snapshot?.projectRef || 'not configured'}`,
      `Supabase plan: ${tier || 'not configured'}`,
      '',
      '1) DATABASE SIZE — LIVE SQL MEASUREMENT',
      database
        ? `Database size (all databases in this Postgres cluster): ${database.pretty} (${database.bytes} bytes)`
        : `Database size: unavailable — ${snapshot?.databaseSizeError || 'measurement not loaded'}`,
      database ? `Measured at (UTC): ${database.measuredAt}` : '',
      'Method: SUM(pg_database_size(datname)) FROM pg_database; this is database data size, not total provisioned disk usage.',
      '',
      '2) EGRESS — COPIED FROM SUPABASE ORGANIZATION USAGE PAGE',
      `Billing period start: ${egress.periodStart || 'not entered'}`,
      `Billing period end: ${egress.periodEnd || 'not entered'}`,
      `Uncached egress: ${uncached === null ? 'not entered' : uncached + ' GB'}`,
      `Cached egress: ${cached === null ? 'not entered' : cached + ' GB'}`,
      `Combined egress: ${monthlyEgressTotal === null ? 'not calculated (enter both values)' : monthlyEgressTotal + ' GB'}`,
      `Egress figures recorded in this browser at (UTC): ${egress.capturedAt || 'not recorded'}`,
      'Egress source: Supabase Dashboard → Organization → Usage, with the TajerTrack project selected. These are manually recorded dashboard values, not an API estimate.',
      '',
      '3) API REQUEST COUNTS — SUPABASE MANAGEMENT API',
      `Returned samples: ${buckets.length}`,
      `Bucket range: ${requestStart} to ${requestEnd}`,
      `REST / Database requests: ${totals.rest}`,
      `Auth requests: ${totals.auth}`,
      `Realtime requests: ${totals.realtime}`,
      `Storage requests: ${totals.storage}`,
      `Total of returned request categories: ${allRequests}`,
      `API data fetched at (UTC): ${snapshot?.fetchedAt || 'not available'}`,
      'Note: the request-count buckets are not egress bytes and are not a complete billing-cycle usage report.',
      '',
      '4) PUBLISHED PLAN ALLOWANCES (REFERENCE ONLY)',
      ...(quotaRows.length ? quotaRows.map((quota) => `${quota.label}: ${quota.amount} — ${quota.scope}`) : ['Plan allowance not configured or Enterprise contract-specific.']),
      'Allowances are separate from current consumption; organization-level metrics may include other projects.',
      '',
      '5) AUDIT NOTES',
      'Database size is an SQL measurement from this project. Supabase billing database-size usage can use daily averages and organization-level aggregation.',
      'Egress values must be read from Supabase Usage with the project filter selected; do not substitute aggregate organization totals unless auditing the whole organization.',
    ].filter((line) => line !== undefined);

    const report = lines.join('\n');
    try {
      await navigator.clipboard.writeText(report);
      setCopyFeedback('تم نسخ تقرير التدقيق. أرسله في المحادثة لتحليل الأرقام الفعلية.');
    } catch {
      setCopyFeedback('تعذر النسخ تلقائياً. اسمح للمتصفح بالوصول إلى الحافظة وحاول مجدداً.');
    }
  }, [allRequests, buckets, egress, quotaRows, snapshot, tier, totals]);

  const updateEgress = (patch: Partial<EgressEntry>) => {
    setEgress((current) => ({
      ...current,
      ...patch,
      capturedAt: new Date().toISOString(),
    }));
  };

  return (
    <section className={styles.usageRoot}>
      <div className={styles.topLine}>
        <div>
          <h2>استهلاك Supabase</h2>
          <p>قياسات فعلية من Supabase، مع توثيق مصدر كل رقم وحدود الباقة.</p>
        </div>
        <div className={styles.topActions}>
          <button type="button" onClick={() => void copyAuditReport()} className={styles.copyButton}>
            نسخ تقرير التدقيق
          </button>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className={styles.refreshButton}>
            {refreshing ? 'جارٍ التحديث…' : 'تحديث الآن'}
          </button>
        </div>
      </div>
      {copyFeedback ? <p className={styles.copyFeedback} role="status">{copyFeedback}</p> : null}

      {loading && !snapshot ? (
        <div className={styles.notice}>جارٍ قراءة بيانات الاستهلاك من Supabase…</div>
      ) : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3>حجم قاعدة البيانات الفعلي</h3>
          <span>قياس SQL مباشر من PostgreSQL</span>
        </div>
        {snapshot?.databaseSize ? (
          <div className={styles.databaseSizeMetric}>
            <strong>{snapshot.databaseSize.pretty}</strong>
            <span>{formatNumber(Number(snapshot.databaseSize.bytes))} bytes</span>
            <small>آخر قياس: {new Date(snapshot.databaseSize.measuredAt).toLocaleString('ar-DZ')}</small>
          </div>
        ) : (
          <p className={styles.empty}>
            {snapshot?.databaseSizeError || 'سيظهر القياس بعد تحميل بيانات Supabase.'}
          </p>
        )}
        <p className={styles.footnote}>
          القياس يجمع أحجام قواعد البيانات داخل PostgreSQL باستخدام pg_database_size. وهو حجم بيانات قاعدة البيانات، وليس حجم القرص المخصص الذي يشمل WAL وملفات النظام.
        </p>
        {!snapshot?.databaseSize ? (
          <p className={styles.migrationHint}>
            فعّل القياس بتطبيق migration: <code>20261112_admin_database_size_monitor.sql</code>
          </p>
        ) : null}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3>استهلاك Egress خلال دورة الفوترة</h3>
          <span>أرقام من صفحة Usage الرسمية</span>
        </div>
        <p className={styles.panelIntro}>
          افتح صفحة Supabase Usage، اختر مشروع TajerTrack وحدد دورة الفوترة الحالية، ثم أدخل القيم المعروضة. تُحفظ هذه الأرقام في هذا المتصفح فقط وتدخل في تقرير النسخ.
        </p>
        <a className={styles.externalLink} href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">
          فتح صفحة Supabase Usage
        </a>
        <div className={styles.egressGrid}>
          <label className={styles.field}>
            <span>بداية دورة الفوترة</span>
            <input type="date" value={egress.periodStart} onChange={(event) => updateEgress({ periodStart: event.target.value })} />
          </label>
          <label className={styles.field}>
            <span>نهاية دورة الفوترة</span>
            <input type="date" value={egress.periodEnd} onChange={(event) => updateEgress({ periodEnd: event.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Uncached Egress (GB)</span>
            <input type="number" min="0" step="0.001" inputMode="decimal" placeholder="مثال: 1.42" value={egress.uncachedGb} onChange={(event) => updateEgress({ uncachedGb: event.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Cached Egress (GB)</span>
            <input type="number" min="0" step="0.001" inputMode="decimal" placeholder="مثال: 0.38" value={egress.cachedGb} onChange={(event) => updateEgress({ cachedGb: event.target.value })} />
          </label>
        </div>
        {numericInput(egress.uncachedGb) !== null || numericInput(egress.cachedGb) !== null ? (
          <div className={styles.egressSummary}>
            <span>Uncached: <strong>{egress.uncachedGb || '—'} GB</strong></span>
            <span>Cached: <strong>{egress.cachedGb || '—'} GB</strong></span>
            <span>Combined: <strong>{
              numericInput(egress.uncachedGb) !== null && numericInput(egress.cachedGb) !== null
                ? (numericInput(egress.uncachedGb)! + numericInput(egress.cachedGb)!).toFixed(3) + ' GB'
                : 'أدخل القيمتين'
            }</strong></span>
          </div>
        ) : null}
        <p className={styles.footnote}>
          لا تُستنتج أرقام Egress من عدد الطلبات. يجب نسخ Uncached وCached من Usage بعد اختيار المشروع والفترة الصحيحين؛ قد تختلف أرقام المؤسسة عن أرقام المشروع.
        </p>
      </div>

      {snapshot?.configured === false ? (
        <div className={styles.setupPanel}>
          <h3>ربط إحصاءات الطلبات</h3>
          <p>يلزم إنشاء مفتاح قراءة محدود من Supabase وإضافته إلى متغيرات Vercel. قياس حجم قاعدة البيانات وحقول Egress أعلاه مستقل عن هذا الربط.</p>
          <ol>
            <li>من Supabase افتح Account → Access Tokens وأنشئ Fine-grained personal access token.</li>
            <li>اسمح له بصلاحية Usage Analytics → Read على مشروع TajerTrack فقط.</li>
            <li>أضف <code>SUPABASE_MANAGEMENT_API_TOKEN</code> في Vercel كـ Secret ضمن Production.</li>
            <li>أضف <code>SUPABASE_PLAN_TIER</code> بقيمة <code>free</code> أو <code>pro</code> أو <code>team</code> أو <code>enterprise</code>.</li>
            {snapshot.missing?.includes('SUPABASE_PROJECT_REF (or a standard NEXT_PUBLIC_SUPABASE_URL)') ? (
              <li>أضف <code>SUPABASE_PROJECT_REF</code> (المعرّف المكوّن من 20 حرفاً) إذا تعذّر استخراجه من رابط Supabase.</li>
            ) : null}
          </ol>
          <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">فتح إعدادات مفاتيح Supabase</a>
        </div>
      ) : null}

      {snapshot?.configured && snapshot.buckets ? (
        <>
          <div className={styles.sourceLine}>
            <span>المشروع: <code>{snapshot.projectRef}</code></span>
            <span>آخر قراءة: {snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString('ar-DZ') : '—'}</span>
            <span>{snapshot.cached ? 'من ذاكرة مؤقتة (5 دقائق)' : 'قراءة جديدة من Supabase'}</span>
          </div>

          <div className={styles.metricsGrid}>
            <article className={styles.metric}>
              <span>إجمالي طلبات الخدمات</span>
              <strong>{formatNumber(allRequests)}</strong>
              <small>مجموع الفترات اليومية المعادة من Supabase</small>
            </article>
            {SERVICES.map((service) => (
              <article className={styles.metric} key={service.key}>
                <span>{service.label}</span>
                <strong>{formatNumber(
                  buckets.reduce((sum, bucket) => sum + bucket[service.key], 0)
                )}</strong>
                <small>طلبات ضمن نفس الفترات</small>
              </article>
            ))}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3>نشاط الطلبات حسب اليوم</h3>
              <span>آخر {buckets.length} فترة يومية متاحة</span>
            </div>
            {buckets.length ? (
              <div className={styles.dailyRows}>
                {buckets.map((bucket) => {
                  const total = bucket.total_rest_requests + bucket.total_auth_requests + bucket.total_realtime_requests + bucket.total_storage_requests;
                  const width = Math.max(total > 0 ? 1 : 0, (total / maxDailyRequests) * 100);
                  return (
                    <div className={styles.dailyRow} key={bucket.timestamp}>
                      <time>{formatDate(bucket.timestamp)}</time>
                      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: width + '%' }} /></div>
                      <strong>{formatNumber(total)}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.empty}>لم تُرجع Supabase فترات استخدام بعد.</p>
            )}
            <p className={styles.footnote}>هذه أعداد طلبات API وليست قياساً لحجم البيانات المنقولة أو التكلفة. وقد تختلف فترات الإحصاء عن دورة الفوترة.</p>
          </div>
        </>
      ) : null}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3>حدود الباقة المضمّنة</h3>
          <span>{tier ? tier.toUpperCase() : 'الباقة غير محددة'}</span>
        </div>
        {quotaRows.length ? (
          <div className={styles.quotaGrid}>
            {quotaRows.map((quota) => (
              <div className={styles.quotaRow} key={quota.label}>
                <div><strong>{quota.label}</strong><small>{quota.scope}</small></div>
                <b>{quota.amount}</b>
              </div>
            ))}
          </div>
        ) : tier === 'enterprise' ? (
          <p className={styles.empty}>حدود Enterprise مخصصة حسب عقد المؤسسة؛ راجع تفاصيل عقدك في لوحة Supabase.</p>
        ) : (
          <p className={styles.empty}>اضبط <code>SUPABASE_PLAN_TIER</code> في Vercel لعرض الحدود الصحيحة لباقة المؤسسة.</p>
        )}
        <p className={styles.footnote}>هذه حصص الباقة المنشورة وليست نسب استهلاك حالية. لا نحسب نسبة الاستخدام دون بيانات فوترة فعلية.</p>
        <a className={styles.externalLink} href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">
          فتح الاستهلاك والفوترة الفعلية في Supabase
        </a>
      </div>

      <div className={styles.disclaimer}>
        حصص Egress وStorage وMAU وEdge Functions وRealtime تُحتسب على مستوى المؤسسة، وقد تشمل مشاريع أخرى. اختر TajerTrack وحده عند تسجيل Egress. حجم قاعدة البيانات هنا قياس حالي للمشروع، بينما فوترة Database Size قد تعتمد متوسطات يومية خلال دورة الفوترة.
      </div>
      {lastChecked ? <div className={styles.lastChecked}>تم فحص الاتصال {lastChecked.toLocaleTimeString('ar-DZ')}</div> : null}
    </section>
  );
}
