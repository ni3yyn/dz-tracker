import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { MerchantDashboardView } from './MerchantDashboardView';
import { logout } from './actions';
import styles from './merchant.module.css';

export default async function MerchantDashboardPage() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return <div className={styles.container}>غير مصرح لك بالدخول. يرجى تسجيل الدخول.</div>;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isAdmin = adminEmail && user.email?.trim().toLowerCase() === adminEmail;

  // جلب ملف التاجر الحالي مع تفاصيل الاشتراك
  let { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id, store_name, api_key, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // إذا لم يكن لديه ملف تاجر (المشرف يجرب الواجهة أو حساب تم إنشاؤه بدون ربط)، نقوم بإنشائه فوراً
  if (!merchant) {
    const storeName = isAdmin
      ? 'متجر الإدارة (Admin Store)'
      : (user.user_metadata?.store_name || user.email?.split('@')[0] || 'متجري');

    const { data: newMerchant } = await supabaseAdmin
      .from('merchants')
      .insert({
        auth_user_id: user.id,
        store_name: storeName,
        subscription_tier: isAdmin ? 'scale' : 'starter',
        subscription_status: 'active',
        max_orders_limit: isAdmin ? 999999 : 30,
      })
      .select('id, store_name, api_key, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at')
      .single();

    if (newMerchant) {
      merchant = newMerchant;
    }
  }

  // في حالة فشل الاتصال بقاعدة البيانات تماماً، نعرض شاشة استعادة مع زر تسجيل الخروج
  if (!merchant) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBoundaryCard}>
          <div className={styles.errorBoundaryIcon} aria-hidden="true">م</div>
          <h2 className={styles.errorBoundaryTitle}>تعذر تهيئة ملف التاجر</h2>
          <p className={styles.errorBoundaryDesc}>
            أنت مسجل الدخول بالبريد: <code>{user.email}</code>. تعذر العثور على متجر مرتبط بحسابك.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <form action={logout}>
              <button type="submit" className={styles.logoutBtn}>
                🚪 تسجيل الخروج
              </button>
            </form>
            <a href="/merchant" className={styles.errorBoundaryRetryBtn}>
              إعادة المحاولة ↻
            </a>
          </div>
        </div>
      </div>
    );
  }

  // جلب جميع الطلبات
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, external_order_id, customer_name, customer_phone, current_status, carrier_name, carrier_tracking_number, tracking_uuid, created_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  // التحقق من صلاحية الاشتراك وتحديثه إذا انتهت المدة
  const now = new Date();
  const isExpired = Boolean(
    merchant.subscription_expires_at &&
    new Date(merchant.subscription_expires_at).getTime() < now.getTime() &&
    merchant.subscription_tier !== 'starter'
  );

  let currentSubscriptionStatus = merchant.subscription_status || 'active';
  if (isExpired && currentSubscriptionStatus === 'active') {
    currentSubscriptionStatus = 'expired';
    await supabaseAdmin
      .from('merchants')
      .update({ subscription_status: 'expired' })
      .eq('id', merchant.id);
  }

  // حساب دقيق للطلبات المستهلكة في الدورة الشهرية الحالية
  const cycleStart = merchant.subscription_expires_at
    ? new Date(new Date(merchant.subscription_expires_at).getTime() - 30 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const ordersInCycle = (orders || []).filter(
    (o) => new Date(o.created_at).getTime() >= cycleStart.getTime()
  ).length;

  const usedCount = Math.max(merchant.monthly_orders_used || 0, ordersInCycle);

  // تحديث العداد تلقائياً في قاعدة البيانات إذا كان غير متزامن
  if ((merchant.monthly_orders_used ?? 0) < usedCount) {
    await supabaseAdmin
      .from('merchants')
      .update({ monthly_orders_used: usedCount })
      .eq('id', merchant.id);
  }

  // جلب سجل المدفوعات للتاجر
  const { data: payments } = await supabaseAdmin
    .from('subscription_payments')
    .select('id, plan_tier, amount_dzd, payment_method, payment_proof_url, transaction_ref, status, admin_notes, created_at, reviewed_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  // جلب مطابقات الحالات وإعدادات الهوية البصرية
  const { data: mappings } = await supabaseAdmin
    .from('status_mappings')
    .select('id, source_status, display_status')
    .eq('merchant_id', merchant.id);

  const brandJsonRow = mappings?.find((m) => m.source_status === '__brand_settings_json__');
  let brandSettings = undefined;
  if (brandJsonRow?.display_status) {
    try {
      brandSettings = JSON.parse(brandJsonRow.display_status);
    } catch {
      // fallback
    }
  }

  const brandColorRow = mappings?.find((m) => m.source_status === '__brand_primary_color__');
  const brandSubtitleRow = mappings?.find((m) => m.source_status === '__brand_subtitle__');
  const brandColor = brandSettings?.brandColor || brandColorRow?.display_status || '#09090B';
  const brandSubtitle = brandSettings?.brandSubtitle || brandSubtitleRow?.display_status || '';

  const cleanMappings = (mappings || []).filter((m) => !m.source_status.startsWith('__brand_'));

  // استخراج رابط الموقع الأساسي
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dz-tracker-three.vercel.app';

  // معالجة سقف الطلبات وتحديثه تلقائياً حسب الباقة
  const currentTier = merchant.subscription_tier || 'starter';
  const tierLimits: Record<string, number> = {
    starter: 30,
    basic: 100,
    growth: 200,
    scale: 999999,
  };
  const defaultPlanLimit = tierLimits[currentTier] || 30;
  const resolvedLimit = currentTier === 'scale'
    ? 999999
    : (merchant.max_orders_limit && merchant.max_orders_limit >= defaultPlanLimit
        ? merchant.max_orders_limit
        : defaultPlanLimit);

  // تصحيح سقف الطلبات في قاعدة البيانات تلقائياً إذا كان قديماً أو متخلفاً عن الباقة المحددة
  if (currentTier === 'scale' && merchant.max_orders_limit !== 999999) {
    await supabaseAdmin
      .from('merchants')
      .update({ max_orders_limit: 999999 })
      .eq('id', merchant.id);
  } else if (merchant.max_orders_limit && merchant.max_orders_limit < defaultPlanLimit) {
    await supabaseAdmin
      .from('merchants')
      .update({ max_orders_limit: defaultPlanLimit })
      .eq('id', merchant.id);
  }

  return (
    <MerchantDashboardView
      storeName={merchant.store_name}
      apiKey={merchant.api_key}
      merchantId={merchant.id}
      orders={orders || []}
      mappings={cleanMappings}
      brandSettings={brandSettings}
      brandColor={brandColor}
      brandSubtitle={brandSubtitle}
      siteUrl={siteUrl}
      subscription={{
        tier: currentTier,
        status: currentSubscriptionStatus,
        limit: resolvedLimit,
        used: usedCount,
        expiresAt: merchant.subscription_expires_at || null,
      }}
      payments={(payments || []) as any}
    />
  );
}