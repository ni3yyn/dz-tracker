import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { AdminDashboardView } from './AdminDashboardView';
import type { SmsManagerData } from './SmsManagerTab';
import type { CustomPlanRequestItem } from './CustomPlanRequestsTab';
import { logout } from './actions';
import styles from './admin.module.css';
import { isAdminConfigured, isAuthorizedAdmin } from '../../../lib/admin-auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'إدارة المنصة',
  description: 'إدارة متاجر تاجر تراك واشتراكاتها وبيانات الشحن.',
};

export default async function AdminDashboardPage() {
  // Server-side authentication and administrator authorization.
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) redirect('/login');

  // Fail closed: a missing allowlist must never expose service-role data.
  if (!isAdminConfigured()) {
    return (
      <div className={styles.deniedContainer}>
        <div className={styles.deniedCard}>
          <h1>لوحة الإدارة غير مهيّأة</h1>
          <p>لم يتم ضبط هوية المدير المصرّح بها على الخادم. أضف ADMIN_USER_ID أو ADMIN_EMAIL في إعدادات الإنتاج.</p>
          <form action={logout}>
            <button type="submit" className={styles.railLogoutBtn}>تسجيل الخروج</button>
          </form>
        </div>
      </div>
    );
  }

  if (!isAuthorizedAdmin(user)) redirect('/merchant');

  const supabase = getSupabaseAdminClient();

  // 2. جلب جميع المتاجر المسجلة في النظام مع بيانات الاشتراكات
  const { data: merchants } = await supabase
    .from('merchants')
    .select('id, store_name, api_key, created_at, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at')
    .order('created_at', { ascending: false });

  // 3. جلب جميع الطلبات عبر المنصة بالكامل
  const { data: orders } = await supabase
    .from('orders')
    .select('id, merchant_id, external_order_id, customer_name, current_status, carrier_name, carrier_tracking_number, tracking_uuid, created_at, merchants(store_name)')
    .order('created_at', { ascending: false });

  // 4. جلب سجل مدفوعات الاشتراكات (BaridiMob & Chargily)
  const { data: payments } = await supabase
    .from('subscription_payments')
    .select('id, merchant_id, plan_tier, amount_dzd, payment_method, payment_proof_url, transaction_ref, status, admin_notes, created_at, reviewed_at, merchants(store_name)')
    .order('created_at', { ascending: false });

  // Public quote requests are read only after server-side administrator authorization.
  const { data: customPlanRequestsData, error: customPlanRequestsError } = await (supabase as any)
    .from('custom_plan_requests')
    .select('id, full_name, store_name, contact_phone, preferred_contact_method, monthly_tracking_urls, carrier_names, requirements, status, admin_notes, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (customPlanRequestsError) {
    console.warn('[CustomPlanRequests] Inbox is unavailable until its database migration is applied:', customPlanRequestsError.message);
  }

  // SMS operations data is fetched only after the administrator authorization check.
  const adminDb = supabase as any;
  const smsStatuses = ['pending', 'processing', 'retry', 'submitted', 'failed', 'unknown', 'skipped', 'dead_letter'];
  const [
    smsJobsResult,
    smsAttemptsResult,
    smsControlResult,
    smsDeviceResult,
    smsEventsResult,
    ...smsCountResults
  ] = await Promise.all([
    adminDb
      .from('sms_tracking_outbox')
      .select('id, order_id, merchant_id, status, attempt_count, max_attempts, available_at, locked_by, locked_at, lease_expires_at, last_error, result_code, created_at, updated_at, submitted_at, orders(external_order_id, customer_name, customer_phone), merchants(store_name)')
      .order('created_at', { ascending: false })
      .limit(150),
    adminDb
      .from('sms_tracking_attempts')
      .select('id, job_id, attempt_number, outcome, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    adminDb
      .from('sms_gateway_control')
      .select('id, enabled, updated_at')
      .eq('id', 'primary')
      .maybeSingle(),
    adminDb
      .from('sms_gateway_devices')
      .select('device_id, display_name, enabled, last_seen_at, last_claim_at, last_result_at, last_status, last_error')
      .eq('device_id', 'android-sms-gateway')
      .maybeSingle(),
    adminDb
      .from('sms_tracking_admin_events')
      .select('id, job_id, action, previous_status, new_status, details, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    ...smsStatuses.map((status) =>
      adminDb
        .from('sms_tracking_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
    ),
  ]);

  const smsSetupErrors = [
    smsJobsResult.error,
    smsAttemptsResult.error,
    smsControlResult.error,
    smsDeviceResult.error,
    smsEventsResult.error,
    ...smsCountResults.map((result: any) => result.error),
  ].filter(Boolean);
  const smsManager: SmsManagerData = {
    ready: smsSetupErrors.length === 0 && Boolean(smsControlResult.data) && Boolean(smsDeviceResult.data),
    setupError: smsSetupErrors[0]?.message || (!smsControlResult.data || !smsDeviceResult.data ? 'إعدادات البوابة أو سجل الجهاز غير موجود.' : null),
    control: smsControlResult.data ? {
      enabled: Boolean(smsControlResult.data.enabled),
      updated_at: smsControlResult.data.updated_at || null,
    } : null,
    device: smsDeviceResult.data || null,
    jobs: smsJobsResult.data || [],
    attempts: smsAttemptsResult.data || [],
    events: smsEventsResult.data || [],
    counts: Object.fromEntries(
      smsStatuses.map((status, index) => [status, smsCountResults[index]?.count || 0])
    ),
  };

  return (
    <AdminDashboardView
      userEmail={user.email || 'admin@dztracker.com'}
      merchants={(merchants || []) as any}
      orders={(orders || []) as any}
      payments={(payments || []) as any}
      customPlanRequests={(customPlanRequestsData || []) as CustomPlanRequestItem[]}
      smsManager={smsManager}
    />
  );
}