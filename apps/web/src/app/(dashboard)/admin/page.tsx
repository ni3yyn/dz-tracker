import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { AdminDashboardView } from './AdminDashboardView';
import { logout } from './actions';
import styles from './admin.module.css';
import { isAdminConfigured, isAuthorizedAdmin } from '../../../lib/admin-auth';
import { redirect } from 'next/navigation';

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

  return (
    <AdminDashboardView
      userEmail={user.email || 'admin@dztracker.com'}
      merchants={(merchants || []) as any}
      orders={(orders || []) as any}
      payments={(payments || []) as any}
    />
  );
}