import React, { Suspense } from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { MerchantDashboardView } from './MerchantDashboardView';
import MerchantDashboardSkeleton from './MerchantDashboardSkeleton';
import { logout } from './actions';
import styles from './merchant.module.css';

export const metadata = {
  title: 'لوحة التاجر',
  description: 'إدارة الشحنات والطلبات والتكاملات وإعدادات متجرك في تاجر تراك.',
};

async function MerchantDashboardContent() {
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
    .select('id, store_name, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at, telegram_tracking_link_enabled, logo_url, confirmation_telegram_enabled')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // إذا لم يكن لديه ملف تاجر (المشرف يجرب الواجهة أو حساب تم إنشاؤه بدون ربط)، نقوم بإنشائه فوراً
  if (!merchant) {
    const storeName = isAdmin
      ? 'متجر الإدارة (Admin Store)'
      : (user.user_metadata?.store_name || user.email?.split('@')[0] || 'متجري');

  // Also update the select for the insert path
    const { data: newMerchant } = await supabaseAdmin
      .from('merchants')
      .insert({
        auth_user_id: user.id,
        store_name: storeName,
        subscription_tier: isAdmin ? 'scale' : 'starter',
        subscription_status: 'active',
        max_orders_limit: isAdmin ? 999999 : 30,
      })
      .select('id, store_name, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at, telegram_tracking_link_enabled, logo_url, confirmation_telegram_enabled')
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
  const extendedOrdersQuery = await supabaseAdmin
    .from('orders')
    .select('id, external_order_id, customer_name, customer_phone, product_name, current_status, carrier_name, carrier_tracking_number, carrier_order_id, carrier_metadata, tracking_uuid, created_at, confirmation_status')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  // Keep the existing merchant dashboard usable during the short deploy/migration
  // window. Maystro-specific columns become available after its SQL is applied.
  let orders: any = extendedOrdersQuery.data;
  if (
    extendedOrdersQuery.error &&
    /carrier_order_id|carrier_metadata/i.test(extendedOrdersQuery.error.message || '')
  ) {
    const fallbackOrdersQuery = await supabaseAdmin
      .from('orders')
      .select('id, external_order_id, customer_name, customer_phone, product_name, current_status, carrier_name, carrier_tracking_number, tracking_uuid, created_at, confirmation_status')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false });
    orders = fallbackOrdersQuery.data;
  }

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

  const currentTier = merchant.subscription_tier || 'starter';

  // Free accounts use a rolling 30-day window. Paid plans use the current
  // 30-day billing period anchored by subscription_expires_at.
  const cycleStart = currentTier === 'starter' || !merchant.subscription_expires_at
    ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    : new Date(new Date(merchant.subscription_expires_at).getTime() - 30 * 24 * 60 * 60 * 1000);

  const ordersInCycle = (orders || []).filter(
    (o) => new Date(o.created_at).getTime() >= cycleStart.getTime()
  ).length;

  // The SQL function serializes this reconciliation against concurrent order
  // creation, so a stale page snapshot can never overwrite a newer counter.
  const { data: reconciledUsage, error: usageReconcileError } = await supabaseAdmin.rpc(
    'reconcile_merchant_order_usage',
    { p_merchant_id: merchant.id }
  );
  if (usageReconcileError) {
    console.error('[Merchant quota]: Could not reconcile displayed usage:', usageReconcileError.message);
  }
  const usedCount = typeof reconciledUsage === 'number' ? reconciledUsage : ordersInCycle;

  // جلب سجل المدفوعات للتاجر
  const { data: payments } = await supabaseAdmin
    .from('subscription_payments')
    .select('id, plan_tier, amount_dzd, payment_method, payment_proof_url, transaction_ref, status, admin_notes, created_at, reviewed_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  // جلب المنتجات المقترحة (قد يعجبك أيضاً)
  const { data: upsells } = await supabaseAdmin
    .from('merchant_upsells')
    .select('*')
    .eq('merchant_id', merchant.id)
    .order('display_order', { ascending: true })
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
  // merchants.logo_url is canonical; retain the JSON fallback for pre-migration data.
  const logoUrl: string | null = (merchant as any)?.logo_url || brandSettings?.logoUrl || null;

  const cleanMappings = (mappings || []).filter((m) => !m.source_status.startsWith('__brand_'));

  // استخراج رابط الموقع الأساسي
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tajertrack.vercel.app';

  // معالجة سقف الطلبات وتحديثه تلقائياً حسب الباقة
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
      merchantId={merchant.id}
      orders={orders || []}
      mappings={cleanMappings}
      brandSettings={brandSettings}
      brandColor={brandColor}
      brandSubtitle={brandSubtitle}
      logoUrl={logoUrl}
      siteUrl={siteUrl}
      subscription={{
        tier: currentTier,
        status: currentSubscriptionStatus,
        limit: resolvedLimit,
        used: usedCount,
        expiresAt: merchant.subscription_expires_at || null,
      }}
      payments={(payments || []) as any}
      telegramTrackingLinkEnabled={merchant.telegram_tracking_link_enabled ?? false}
      confirmationTelegramEnabled={(merchant as any).confirmation_telegram_enabled ?? false}
      initialUpsells={(upsells || []) as any}
    />
  );
}

export default function MerchantDashboardPage() {
  return (
    <Suspense fallback={<MerchantDashboardSkeleton />}>
      <MerchantDashboardContent />
    </Suspense>
  );
}
