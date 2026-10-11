import React from 'react';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { MappingForm } from './MappingForm';
import styles from './merchant.module.css';
import { StatusSelector } from './StatusSelector';


export default async function MerchantDashboardPage() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return <div className={styles.container}>غير مصرح لك بالدخول.</div>;
  }

  const supabaseAdmin = getSupabaseAdminClient();

  const { data: merchant } = await supabaseAdmin
    .from('merchants')
    .select('id, store_name, api_key')
    .eq('auth_user_id', user.id)
    .single();

  if (!merchant) {
    return (
      <div className={styles.container}>
        <h2>لم يتم العثور على ملف تاجر مرتبط بحسابك.</h2>
      </div>
    );
  }

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, external_order_id, customer_name, current_status, tracking_uuid, created_at')
    .eq('merchant_id', merchant.id)
    .order('created_at', { ascending: false });

  const { data: mappings } = await supabaseAdmin
    .from('status_mappings')
    .select('id, source_status, display_status')
    .eq('merchant_id', merchant.id);

  const orderList = orders || [];
  const mappingList = mappings || [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const shopifyWebhookUrl = `${siteUrl}/api/webhooks/shopify?key=${merchant.api_key}`;

  return (
    <div className={styles.container}>
      {/* رأس الصفحة */}
      <header className={styles.dashboardHeader}>
        <div>
          <h1 className={styles.title}>لوحة تحكم المتجر</h1>
          <p className={styles.subtitle}>أهلاً بك، {merchant.store_name}</p>
        </div>
      </header>

      {/* دليل التثبيت السريع لشوبيفاي (Onboarding Guide) */}
      <section className={styles.onboardingCard}>
        <div className={styles.onboardingHeader}>
          <span className={styles.shopifyBadge}>Shopify Integration</span>
          <h2>طريقة ربط متجرك على شوبيفاي في دقيقتين 🛍️</h2>
          <p>اتبع هذه الخطوات البسيطة لتبدأ باستقبال التحديثات تلقائياً فور خروج أي شحنة:</p>
        </div>

        <ol className={styles.stepsList}>
          <li>
            ادخل إلى لوحة تحكم متجرك في <strong>Shopify Admin</strong> ➔ <strong>Settings (الإعدادات)</strong> ➔ <strong>Notifications (الإشعارات)</strong>.
          </li>
          <li>
            انزل إلى أسفل الصفحة حتى تصل لقسم <strong>Webhooks</strong> واضغط <strong>Create Webhook</strong>.
          </li>
          <li>
            اختر الحدث (Event): <strong>Order fulfillment</strong>، والصيغة (Format): <strong>JSON</strong>.
          </li>
          <li>
            ألصق هذا الرابط في خانة <strong>URL</strong> واضغط حفظ:
            <div className={styles.urlBox}>
              <code>{shopifyWebhookUrl}</code>
            </div>
          </li>
        </ol>
      </section>

      {/* بطاقات الإحصائيات ومعلومات الربط */}
      <section className={styles.statsGrid}>
        <div className={styles.card}>
          <span className={styles.statLabel}>إجمالي الطلبات المسجلة</span>
          <span className={styles.statValue}>{orderList.length}</span>
        </div>

        <div className={styles.card}>
          <span className={styles.statLabel}>الحالات المخصصة المفعلة</span>
          <span className={styles.statValue}>{mappingList.length}</span>
        </div>

        <div className={`${styles.card} ${styles.credentialsCard}`}>
          <span className={styles.statLabel}>مفتاح الـ API الخاص بمتجرك:</span>
          <code className={styles.codeSnippet}>{merchant.api_key}</code>
        </div>
      </section>

      {/* مطابقة حالات الطلبات */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>مطابقة حالات شوبيفاي المخصصة</h2>
          <p className={styles.sectionDesc}>
            شوبيفاي ترسل حالات مثل <code>shopify_in_transit</code> أو <code>shopify_delivered</code>. يمكنك هنا تخصيص ما يراه عميلك بالعربية:
          </p>
        </div>

        <MappingForm merchantId={merchant.id} />

        {mappingList.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>حالة شوبيفاي</th>
                  <th>الاسم المعروض للعميل في الرابط</th>
                </tr>
              </thead>
              <tbody>
                {mappingList.map((m) => (
                  <tr key={m.id}>
                    <td><code>{m.source_status}</code></td>
                    <td className={styles.highlightText}>{m.display_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* جدول الطلبات */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>الطلبات وروابط التتبع الحية</h2>
        </div>

        {orderList.length === 0 ? (
          <div className={styles.emptyState}>
            <p>لم يصل أي طلب من متجرك حتى الآن.</p>
            <small>بمجرد قيام عميل بطلب منتج على شوبيفاي، سيظهر هنا فوراً مع رابط التتبع الخاص به.</small>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>اسم العميل</th>
                  <th>الحالة الحالية</th>
                  <th>تاريخ الطلب</th>
                  <th>رابط العميل</th>
                </tr>
              </thead>
              <tbody>
                {orderList.map((order) => (
                  <tr key={order.id}>
                    <td className={styles.orderRef}>{order.external_order_id}</td>
                    <td>{order.customer_name || 'عميل شوبيفاي'}</td>
                    <td>
  <StatusSelector orderId={order.id} currentStatus={order.current_status} />
</td>
                    <td>{new Date(order.created_at).toLocaleDateString('ar-EG')}</td>
                    <td>
                      <a
                        href={`/t/${order.tracking_uuid}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.trackLink}
                      >
                        فتح رابط التتبع ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}