import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import styles from './admin.module.css';

export default async function AdminDashboardPage() {
  // 1. التحقق من هوية السوبر أدمن
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  const adminEmail = process.env.ADMIN_EMAIL;

  // إذا لم يكن مسجل دخول أو كان البريد لا يطابق بريد الأدمن
  if (!user || (adminEmail && user.email !== adminEmail)) {
    return (
      <div className={styles.deniedContainer}>
        <div className={styles.deniedCard}>
          <h1>403 - غير مصرح لك بالوصول ⛔</h1>
          <p>هذه الصفحة مخصصة فقط لمدير المنصة (Super Admin).</p>
          <p className={styles.deniedSub}>حسابك الحالي: <code>{user?.email || 'غير مسجل'}</code></p>
          <a href="/merchant" className={styles.backBtn}>العودة للوحة التاجر</a>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdminClient();

  // 2. جلب جميع المتاجر المسجلة في النظام
  const { data: merchants } = await supabase
    .from('merchants')
    .select('id, store_name, api_key, created_at')
    .order('created_at', { ascending: false });

  // 3. جلب جميع الطلبات عبر المنصة بالكامل
  const { data: orders } = await supabase
    .from('orders')
    .select('id, merchant_id, external_order_id, customer_name, current_status, carrier_name, tracking_uuid, created_at, merchants(store_name)')
    .order('created_at', { ascending: false });

  const merchantsList = merchants || [];
  const ordersList = orders || [];

  // حساب عدد الطلبات لكل متجر
  const ordersCountByMerchant = ordersList.reduce((acc: Record<string, number>, order) => {
    acc[order.merchant_id] = (acc[order.merchant_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.container}>
      {/* رأس صفحة الأدمن */}
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>Super Admin Console</span>
          <h1 className={styles.title}>مركز إدارة المنصة ⚡</h1>
          <p className={styles.subtitle}>مرحباً بك، {user.email}</p>
        </div>
        <a href="/merchant" className={styles.switchViewBtn}>عرض لوحة التاجر ↗</a>
      </header>

      {/* بطاقات الإحصائيات العامة */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>إجمالي المتاجر المشتركة</span>
          <span className={styles.statNumber}>{merchantsList.length}</span>
          <span className={styles.statSub}>متاجر نشطة على النظام</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>إجمالي الطلبات المعالجة</span>
          <span className={styles.statNumber}>{ordersList.length}</span>
          <span className={styles.statSub}>شحنة تم توليد روابط تتبع لها</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>حالة النظام و خوادم Webhooks</span>
          <span className={`${styles.statNumber} ${styles.statusOnline}`}>Online 🟢</span>
          <span className={styles.statSub}>تعمل عبر Supabase & Next.js 16</span>
        </div>
      </section>

      {/* جدول جميع المتاجر (Merchants Directory) */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>دليل المتاجر المسجلة ({merchantsList.length})</h2>
          <p>عرض تفاصيل ومفاتيح API لجميع المستأجرين (Tenants) على المنصة.</p>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>اسم المتجر</th>
                <th>إجمالي الطلبات</th>
                <th>مفتاح الـ API</th>
                <th>تاريخ الانضمام</th>
              </tr>
            </thead>
            <tbody>
              {merchantsList.map((m) => (
                <tr key={m.id}>
                  <td className={styles.storeNameCell}>{m.store_name}</td>
                  <td>
                    <span className={styles.countBadge}>
                      {ordersCountByMerchant[m.id] || 0} طلب
                    </span>
                  </td>
                  <td>
                    <code className={styles.codeSnippet}>{m.api_key}</code>
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* سجل الأحداث المباشر للطلبات (Platform Global Feed) */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>آخر الطلبات الواردة للمنصة (Live Feed)</h2>
          <p>تدفق مباشر لجميع الـ Webhooks الواردة من شوبيفاي والمتاجر المخصصة.</p>
        </div>

        {ordersList.length === 0 ? (
          <p className={styles.emptyText}>لا توجد أي طلبات مسجلة في قاعدة البيانات حتى الآن.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>المتجر التابع له</th>
                  <th>رقم الطلب</th>
                  <th>العميل</th>
                  <th>الحالة</th>
                  <th>شركة الشحن</th>
                  <th>رابط التتبع</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {ordersList.slice(0, 15).map((order) => {
                  const store = Array.isArray(order.merchants)
                    ? order.merchants[0]?.store_name
                    : (order.merchants as any)?.store_name || 'غير معروف';

                  return (
                    <tr key={order.id}>
                      <td className={styles.storeTag}>{store}</td>
                      <td className={styles.orderRef}>{order.external_order_id}</td>
                      <td>{order.customer_name || '—'}</td>
                      <td><span className={styles.statusBadge}>{order.current_status}</span></td>
                      <td>{order.carrier_name || '—'}</td>
                      <td>
                        <a
                          href={`/t/${order.tracking_uuid}`}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.link}
                        >
                          عرض الرابط ↗
                        </a>
                      </td>
                      <td>{new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}