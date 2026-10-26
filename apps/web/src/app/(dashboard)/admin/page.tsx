import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { AdminDashboardView } from './AdminDashboardView';
import { logout } from './actions';
import styles from './admin.module.css';

export default async function AdminDashboardPage() {
  // 1. التحقق من هوية السوبر أدمن
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user?.email?.trim().toLowerCase();

  // إذا لم يكن مسجل دخول أو كان البريد لا يطابق بريد الأدمن
  if (!user || (adminEmail && userEmail !== adminEmail)) {
    return (
      <div className={styles.deniedContainer}>
        <div className={styles.deniedCard}>
          <h1>403 — غير مصرح لك بالوصول</h1>
          <p>هذه الصفحة مخصصة فقط لمدير المنصة (Super Admin).</p>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            حسابك الحالي: <code>{user?.email || 'غير مسجل'}</code>
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <a href="/merchant" className={styles.backBtn}>العودة للوحة التاجر</a>
            <form action={logout}>
              <button type="submit" className={styles.railLogoutBtn} style={{ padding: '0.6rem 1.25rem' }}>
                تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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