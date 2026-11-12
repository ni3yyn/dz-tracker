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

type UsageSnapshot = {
  configured?: boolean;
  missing?: string[];
  projectRef?: string;
  planTier?: string | null;
  interval?: '1day';
  buckets?: UsageBucket[];
  fetchedAt?: string;
  cached?: boolean;
  error?: string;
};

type Quota = { label: string; amount: string; scope: string };

const QUOTAS: Record<string, Quota[]> = {
  free: [
    { label: 'إجمالي نقل البيانات (Egress)', amount: '5 GB', scope: 'على مستوى المؤسسة' },
    { label: 'حجم قاعدة البيانات', amount: '500 MB', scope: 'لكل مشروع' },
    { label: 'مساحة Storage', amount: '1 GB', scope: 'على مستوى المؤسسة' },
    { label: 'المستخدمون النشطون شهرياً (MAU)', amount: '50,000', scope: 'على مستوى المؤسسة' },
    { label: 'استدعاءات Edge Functions', amount: '500,000', scope: 'على مستوى المؤسسة' },
    { label: 'رسائل Realtime', amount: '2,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'ذروة اتصالات Realtime', amount: '200', scope: 'على مستوى المؤسسة' },
  ],
  pro: [
    { label: 'إجمالي نقل البيانات (Egress)', amount: '250 GB', scope: 'على مستوى المؤسسة' },
    { label: 'حجم قاعدة البيانات', amount: '8 GB', scope: 'لكل مشروع' },
    { label: 'مساحة Storage', amount: '100 GB', scope: 'على مستوى المؤسسة' },
    { label: 'المستخدمون النشطون شهرياً (MAU)', amount: '100,000', scope: 'على مستوى المؤسسة' },
    { label: 'استدعاءات Edge Functions', amount: '2,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'رسائل Realtime', amount: '5,000,000', scope: 'على مستوى المؤسسة' },
    { label: 'ذروة اتصالات Realtime', amount: '500', scope: 'على مستوى المؤسسة' },
  ],
  team: [
    { label: 'إجمالي نقل البيانات (Egress)', amount: '250 GB', scope: 'على مستوى المؤسسة' },
    { label: 'حجم قاعدة البيانات', amount: '8 GB', scope: 'لكل مشروع' },
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

export default function SupabaseUsageTab() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      if (!response.ok) throw new Error(body.error || 'تعذر جلب استهلاك Supabase.');
      setSnapshot(body);
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

  return (
    <section className={styles.usageRoot}>
      <div className={styles.topLine}>
        <div>
          <h2>استهلاك Supabase</h2>
          <p>قياسات فعلية من Supabase Management API، مع حدود الباقة المنشورة.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className={styles.refreshButton}>
          {refreshing ? 'جارٍ التحديث…' : 'تحديث الآن'}
        </button>
      </div>

      {loading && !snapshot ? (
        <div className={styles.notice}>جارٍ قراءة بيانات الاستهلاك من Supabase…</div>
      ) : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      {snapshot?.configured === false ? (
        <div className={styles.setupPanel}>
          <h3>ربط مراقبة الاستهلاك</h3>
          <p>يلزم إنشاء مفتاح قراءة محدود من Supabase وإضافته إلى متغيرات Vercel. لا تضع المفتاح في الواجهة أو في GitHub.</p>
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
        <p className={styles.footnote}>هذه حصص الباقة المنشورة وليست نسب استهلاك حالية. لا نحسب نسبة الاستخدام دون بيانات فوترة فعلية حتى لا نعرض أرقاماً مضللة.</p>
        <a className={styles.externalLink} href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">
          فتح الاستهلاك والفوترة الفعلية في Supabase
        </a>
      </div>

      <div className={styles.disclaimer}>
        ملحوظة: حصص Egress وStorage وMAU وEdge Functions وRealtime تُحتسب على مستوى المؤسسة، بينما حد حجم قاعدة البيانات المذكور لكل مشروع. راجع صفحة المؤسسة للتأكد من إجمالي كل المشاريع.
      </div>
      {lastChecked ? <div className={styles.lastChecked}>تم فحص الاتصال {lastChecked.toLocaleTimeString('ar-DZ')}</div> : null}
    </section>
  );
}
