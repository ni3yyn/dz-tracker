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

  // Read SMS availability separately so a deployment can safely precede the SQL migration.
// Until the column exists, the dashboard remains usable and the SMS control stays disabled.
let smsTrackingLinkEnabled = false;
let smsTrackingStorageAvailable = false;
if (merchant) {
  const { data: smsSettings, error: smsSettingsError } = await supabaseAdmin
    .from('merchants')
    .select('sms_tracking_enabled')
    .eq('id', merchant.id)
    .maybeSingle();

  if (!smsSettingsError) {
    smsTrackingStorageAvailable = true;
    smsTrackingLinkEnabled = Boolean(smsSettings?.sms_tracking_enabled);
  } else {
    console.warn('[SmsTracking] SMS settings are unavailable until the database migration is applied:', smsSettingsError.message);
  }
}

// Native phone columns arrive with the native SMS gateway migration. Keep the
// merchant dashboard usable on deployments where that migration is not live yet.
let nativeSmsGatewayStorageAvailable = false;
let nativeSmsDevice: { display_name: string; enabled: boolean } | null = null;
if (merchant) {
  const { data: nativeDevice, error: nativeDeviceError } = await (supabaseAdmin as any)
    .from('sms_gateway_devices')
    .select('display_name, enabled, connected_at')
    .eq('merchant_id', merchant.id)
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!nativeDeviceError) {
    nativeSmsGatewayStorageAvailable = true;
    nativeSmsDevice = nativeDevice
      ? { display_name: nativeDevice.display_name, enabled: Boolean(nativeDevice.enabled) }
      : null;
  } else {
    console.warn('[NativeSmsGateway] Phone status is unavailable until the native SMS migration is applied:', nativeDeviceError.message);
  }
}

const nativeSmsDownloadUrl = process.env.TAJERTRACK_PHONE_APK_URL?.trim() || null;

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
    .select('id, external_order_id, customer_name, customer_phone, product_name, current_status, carrier_name, carrier_tracking_number, carrier_last_event_at, carrier_order_id, carrier_metadata, tracking_uuid, created_at, confirmation_status')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  // Keep the dashboard available when optional carrier snapshot columns differ
  // during a rolling migration. Without carrier_last_event_at, time-based rules
  // stay silent instead of guessing from updated_at.
  let orders: any = extendedOrdersQuery.data;
  if (
    extendedOrdersQuery.error &&
    /carrier_order_id|carrier_metadata|carrier_last_event_at/i.test(extendedOrdersQuery.error.message || '')
  ) {
    const fallbackOrdersQuery = await supabaseAdmin
      .from('orders')
      .select('id, external_order_id, customer_name, customer_phone, product_name, current_status, carrier_name, carrier_tracking_number, carrier_last_event_at, tracking_uuid, created_at, confirmation_status')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false });
    orders = fallbackOrdersQuery.data;

    if (
      fallbackOrdersQuery.error &&
      /carrier_last_event_at/i.test(fallbackOrdersQuery.error.message || '')
    ) {
      const minimalOrdersQuery = await supabaseAdmin
        .from('orders')
        .select('id, external_order_id, customer_name, customer_phone, product_name, current_status, carrier_name, carrier_tracking_number, tracking_uuid, created_at, confirmation_status')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false });
      orders = minimalOrdersQuery.data;
      if (minimalOrdersQuery.error) {
        console.error('[MerchantDashboard] Could not load fallback orders:', minimalOrdersQuery.error.message);
      }
    }
  }

  const { data: exceptionStatesData, error: exceptionStatesError } = await (supabaseAdmin as any)
    .from('merchant_shipment_exception_states')
    .select('order_id, exception_type, state, event_fingerprint, snoozed_until, updated_at')
    .eq('merchant_id', merchant.id);
  if (exceptionStatesError) {
    console.error('[ShipmentExceptions] Could not load merchant exception actions:', exceptionStatesError.message);
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

  const exchangeRequestsEnabled = Boolean(mappings?.some((mapping) => mapping.source_status === '__feature_exchange_requests_enabled__' && mapping.display_status === 'true'));
  const { data: exchangeRequestRows, error: exchangeRequestsError } = await (supabaseAdmin as any)
    .from('order_exchange_requests')
    .select('id, merchant_id, order_id, reason, customer_note, status, merchant_response, created_at, updated_at, reviewed_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });
  const { data: exchangeShipmentRows, error: exchangeShipmentsError } = await (supabaseAdmin as any)
    .from('order_exchange_shipments')
    .select('id, merchant_id, exchange_request_id, original_order_id, source_provider, carrier_name, carrier_tracking_number, carrier_order_id, customer_name, customer_phone, product_name, current_status, status_title, possible_exchange_request_ids, match_status, created_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });
  const exchangeRequestsStorageAvailable = !exchangeRequestsError && !exchangeShipmentsError;
  if (exchangeRequestsError) console.error('[ExchangeRequests] Could not load exchange requests:', exchangeRequestsError.message);
  if (exchangeShipmentsError) console.error('[ExchangeRequests] Could not load replacement shipments:', exchangeShipmentsError.message);
  const orderById = new Map((orders || []).map((order: any) => [order.id, order]));
  const linkedShipmentsByRequest = new Map((exchangeShipmentRows || [])
    .filter((shipment: any) => shipment.match_status === 'linked' && shipment.exchange_request_id)
    .map((shipment: any) => [shipment.exchange_request_id, shipment]));
  const initialExchangeRequests = (exchangeRequestRows || []).map((request: any) => {
    const order = orderById.get(request.order_id) as any;
    return {
      ...request,
      order: order ? { external_order_id: order.external_order_id, customer_name: order.customer_name, product_name: order.product_name } : null,
      replacement_shipment: linkedShipmentsByRequest.get(request.id) || null,
    };
  });
  const initialExchangeCandidates = (exchangeShipmentRows || [])
    .filter((shipment: any) => shipment.match_status === 'needs_confirmation');
  const exchangeStatusByOrder = new Map((exchangeRequestRows || [])
    .filter((request: any) => ['awaiting_shipment', 'replacement_in_transit'].includes(request.status))
    .map((request: any) => [request.order_id, request.status]));
  orders = (orders || []).map((order: any) => ({
    ...order,
    exchange_status: exchangeStatusByOrder.get(order.id) || null,
  }));
  const cleanMappings = (mappings || []).filter((m) => !m.source_status.startsWith('__brand_') && !m.source_status.startsWith('__feature_'));

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
      exceptionStates={(exceptionStatesData || []) as any}
      exceptionStateStorageAvailable={!exceptionStatesError}
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
      smsTrackingLinkEnabled={smsTrackingLinkEnabled}
      smsTrackingStorageAvailable={smsTrackingStorageAvailable}
      nativeSmsGatewayStorageAvailable={nativeSmsGatewayStorageAvailable}
      nativeSmsDevice={nativeSmsDevice}
      nativeSmsDownloadUrl={nativeSmsDownloadUrl}
      confirmationTelegramEnabled={(merchant as any).confirmation_telegram_enabled ?? false}
      initialUpsells={(upsells || []) as any}
      exchangeRequestsEnabled={exchangeRequestsEnabled}
      initialExchangeRequests={initialExchangeRequests as any}
      initialExchangeCandidates={initialExchangeCandidates as any}
      exchangeRequestsStorageAvailable={exchangeRequestsStorageAvailable}
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
