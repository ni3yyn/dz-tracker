'use client';

import React, { useState } from 'react';
import { StatusSelector } from './StatusSelector';
import { MappingForm } from './MappingForm';
import styles from './merchant.module.css';

interface OrderItem {
  id: string;
  external_order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  current_status: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  tracking_uuid: string;
  created_at: string;
}

interface MappingItem {
  id: string;
  source_status: string;
  display_status: string;
}

interface Props {
  storeName: string;
  apiKey: string;
  merchantId: string;
  orders: OrderItem[];
  mappings: MappingItem[];
  siteUrl: string;
}

export function MerchantDashboardView({
  storeName,
  apiKey,
  merchantId,
  orders,
  mappings,
  siteUrl,
}: Props) {
  const [activeTab, setActiveTab] = useState<'orders' | 'integrations' | 'mappings'>('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'transit' | 'alerts' | 'delivered'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editDisplayStatus, setEditDisplayStatus] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // دالة حفظ التعديل المباشر
  const handleSaveInlineEdit = async (sourceStatus: string) => {
    if (!editDisplayStatus.trim()) return;
    setIsSavingEdit(true);

    const fd = new FormData();
    fd.append('merchant_id', merchantId);
    fd.append('source_status', sourceStatus);
    fd.append('display_status', editDisplayStatus);

    const { saveStatusMapping } = await import('./actions');
    await saveStatusMapping(fd);

    setEditingMappingId(null);
    setIsSavingEdit(false);
  };

  // نسخ النصوص مع إشعار بصري سريع
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // روابط الـ Webhooks المخصصة
  const shopifyUrl = `${siteUrl}/api/webhooks/shopify?key=${apiKey}`;
  const yalidineUrl = `${siteUrl}/api/webhooks/yalidine?key=${apiKey}`;
  const ecotrackUrl = `${siteUrl}/api/webhooks/ecotrack?key=${apiKey}`;

  // حساب مؤشرات الأداء الحيوية (KPIs)
  const deliveredCount = orders.filter((o) => o.current_status === 'delivered').length;
  const inTransitCount = orders.filter((o) =>
    ['in_transit', 'out_for_delivery', 'dispatched', 'shipped', 'ready_for_pickup'].includes(o.current_status)
  ).length;
  const alertCount = orders.filter((o) =>
    o.current_status.includes('attempt_failed') || o.current_status.includes('alerte')
  ).length;

  // تصفية الطلبات حسب البحث والفلتر
  const filteredOrders = orders.filter((order) => {
    const matchSearch =
      (order.external_order_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customer_phone || '').includes(searchTerm);

    if (!matchSearch) return false;

    if (statusFilter === 'delivered') return order.current_status === 'delivered';
    if (statusFilter === 'transit') {
      return ['in_transit', 'out_for_delivery', 'dispatched', 'shipped', 'ready_for_pickup'].includes(
        order.current_status
      );
    }
    if (statusFilter === 'alerts') {
      return order.current_status.includes('attempt_failed') || order.current_status.includes('alerte');
    }
    return true;
  });

  // توليد رابط محادثة واتساب المباشرة
  const getWhatsAppUrl = (order: OrderItem) => {
    let phone = (order.customer_phone || '').replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '213' + phone.substring(1);
    const trackingUrl = `${siteUrl}/t/${order.tracking_uuid}`;
    const message = `مرحباً ${order.customer_name || ''}، يمكنك متابعة حالة طلبك رقم ${order.external_order_id} لحظة بلحظة من هنا:\n${trackingUrl}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className={styles.container}>
      {/* رأس الصفحة مع بيانات المتجر */}
      <header className={styles.topHeader}>
        <div className={styles.brandInfo}>
          <div className={styles.avatarLetter}>{storeName.charAt(0)}</div>
          <div>
            <h1 className={styles.storeTitle}>{storeName}</h1>
            <p className={styles.storeSubtitle}>مركز متابعة الشحنات وتجربة ما بعد الشراء</p>
          </div>
        </div>

        <div className={styles.apiKeyBar}>
          <span className={styles.apiLabel}>مفتاح المتجر (API Key):</span>
          <code className={styles.apiKeySnippet}>{apiKey}</code>
          <button
            onClick={() => copyToClipboard(apiKey, 'api_key')}
            className={styles.copyBtnMini}
            type="button"
          >
            {copiedKey === 'api_key' ? 'تم النسخ ✓' : 'نسخ'}
          </button>
        </div>
      </header>

      {/* شريط الإحصائيات العامة */}
      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiTitle}>إجمالي الطلبات</span>
          <span className={styles.kpiValue}>{orders.length}</span>
          <span className={styles.kpiDesc}>شحنة مسجلة عبر جميع القنوات</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.kpiTransit}`}>
          <span className={styles.kpiTitle}>شحنات في الطريق 🚚</span>
          <span className={styles.kpiValue}>{inTransitCount}</span>
          <span className={styles.kpiDesc}>قيد النقل والتوزيع مع المناديب</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.kpiAlert}`}>
          <span className={styles.kpiTitle}>تنبيهات / لم يتم الرد ⚠️</span>
          <span className={styles.kpiValue}>{alertCount}</span>
          <span className={styles.kpiDesc}>تتطلب إعادة الاتصال بالزبون</span>
        </div>

        <div className={`${styles.kpiCard} ${styles.kpiSuccess}`}>
          <span className={styles.kpiTitle}>تم التسليم بنجاح ✅</span>
          <span className={styles.kpiValue}>{deliveredCount}</span>
          <span className={styles.kpiDesc}>شحنة مقبوضة ومكتملة</span>
        </div>
      </section>

      {/* شريط التبويبات الرئيسي (Tabs) */}
      <nav className={styles.tabsNav}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'orders' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('orders')}
          type="button"
        >
          📦 الطلبات والشحنات ({orders.length})
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'integrations' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('integrations')}
          type="button"
        >
          🔌 بوابات الربط (Shopify & الشحن)
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'mappings' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('mappings')}
          type="button"
        >
          🏷️ مطابقة وتخصيص الحالات ({mappings.length})
        </button>
      </nav>

      {/* =========================================================
          TAB 1: شاشة الطلبات والشحنات
         ========================================================= */}
      {activeTab === 'orders' && (
        <section className={styles.tabContent}>
          {/* شريط التصفية والبحث */}
          <div className={styles.filterToolbar}>
            <div className={styles.filterChips}>
              <button
                className={`${styles.chip} ${statusFilter === 'all' ? styles.chipActive : ''}`}
                onClick={() => setStatusFilter('all')}
                type="button"
              >
                الكل ({orders.length})
              </button>
              <button
                className={`${styles.chip} ${statusFilter === 'transit' ? styles.chipActive : ''}`}
                onClick={() => setStatusFilter('transit')}
                type="button"
              >
                في الطريق ({inTransitCount})
              </button>
              <button
                className={`${styles.chip} ${styles.chipAlert} ${statusFilter === 'alerts' ? styles.chipActive : ''}`}
                onClick={() => setStatusFilter('alerts')}
                type="button"
              >
                تنبيهات (لم يرد) ({alertCount}) ⚠️
              </button>
              <button
                className={`${styles.chip} ${styles.chipSuccess} ${statusFilter === 'delivered' ? styles.chipActive : ''}`}
                onClick={() => setStatusFilter('delivered')}
                type="button"
              >
                مسلمة ({deliveredCount})
              </button>
            </div>

            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="بحث برقم الطلب، اسم العميل، الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>

          {/* جدول الشحنات */}
          {filteredOrders.length === 0 ? (
            <div className={styles.emptyState}>
              <p>لا توجد طلبات مطابقة للبحث أو التصفية الحالية.</p>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>رقم الطلب</th>
                    <th>العميل</th>
                    <th>الهاتف</th>
                    <th>شركة التوصيل</th>
                    <th>الحالة الحالية</th>
                    <th>إجراءات الزبون</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className={order.current_status.includes('attempt_failed') ? styles.rowAlert : ''}>
                      <td className={styles.orderIdCell}>{order.external_order_id}</td>
                      <td className={styles.boldCell}>{order.customer_name || 'عميل'}</td>
                      <td className={styles.monoCell}>{order.customer_phone || '—'}</td>
                      <td>
                        {order.carrier_name ? (
                          <div className={styles.carrierBadge}>
                            <span>{order.carrier_name}</span>
                            {order.carrier_tracking_number && (
                              <small>{order.carrier_tracking_number}</small>
                            )}
                          </div>
                        ) : (
                          <span className={styles.neutralMuted}>متجر مباشر</span>
                        )}
                      </td>
                      <td>
                        <StatusSelector orderId={order.id} currentStatus={order.current_status} />
                      </td>
                      <td>
                        <div className={styles.actionButtonsGroup}>
                          <a
                            href={`/t/${order.tracking_uuid}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.trackLinkBtn}
                            title="فتح صفحة العميل"
                          >
                            رابط التتبع ↗
                          </a>

                          {order.customer_phone && (
                            <a
                              href={getWhatsAppUrl(order)}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.whatsappBtn}
                              title="إرسال الرابط للزبون عبر واتساب"
                            >
                              📲 واتساب
                            </a>
                          )}
                        </div>
                      </td>
                      <td className={styles.dateCell}>
                        {new Date(order.created_at).toLocaleDateString('ar-EG', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* =========================================================
          TAB 2: مركز التكاملات وبوابات الربط
         ========================================================= */}
      {activeTab === 'integrations' && (
        <section className={styles.tabContent}>
          <div className={styles.sectionHeadingBox}>
            <h2>مركز ربط القنوات وشركات التوصيل 🔌</h2>
            <p>اختر القناة التي تبيع أو تشحن من خلالها، وانسخ رابط الـ Webhook الخاص بها بنقرة زر واحدة:</p>
          </div>

          <div className={styles.integrationsGrid}>
            {/* 1. بطاقة شوبيفاي */}
            <div className={styles.integrationCard}>
              <div className={styles.cardTop}>
                <span className={styles.tagGreen}>Shopify</span>
                <h3>متجر شوبيفاي</h3>
              </div>
              <p className={styles.cardDesc}>
                لاستقبال الطلبات وتحديثات خروج الشحنات وتسليمها تلقائياً من متجر شوبيفاي.
              </p>
              <div className={styles.codeBox}>
                <code>{shopifyUrl}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(shopifyUrl, 'shopify')}
                  className={styles.copyBtn}
                >
                  {copiedKey === 'shopify' ? 'تم النسخ ✓' : 'نسخ الرابط'}
                </button>
              </div>
              <small className={styles.hintText}>
                ألصق الرابط في <strong>Shopify Settings ➔ Notifications ➔ Webhooks</strong> مع حدث <strong>Order updated</strong>.
              </small>
            </div>

            {/* 2. بطاقة ياليدين */}
            <div className={styles.integrationCard}>
              <div className={styles.cardTop}>
                <span className={styles.tagOrange}>Yalidine Express</span>
                <h3>شركة ياليدين للتوصيل</h3>
              </div>
              <p className={styles.cardDesc}>
                لتحديث حالات الشحن ونقل الولايات وتنبيهات عدم الرد (Client ne répond pas) آلياً.
              </p>
              <div className={styles.codeBox}>
                <code>{yalidineUrl}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(yalidineUrl, 'yalidine')}
                  className={styles.copyBtn}
                >
                  {copiedKey === 'yalidine' ? 'تم النسخ ✓' : 'نسخ الرابط'}
                </button>
              </div>
              <small className={styles.hintText}>
                ألصق الرابط في حسابك لدى <strong>Yalidine ➔ Développement ➔ Webhooks</strong>.
              </small>
            </div>

            {/* 3. بطاقة إيكوتراك (80+ شركة شحن) */}
            <div className={styles.integrationCard}>
              <div className={styles.cardTop}>
                <span className={styles.tagBlue}>EcoTrack Network</span>
                <h3>شبكة إيكوتراك (80+ شركة شحن)</h3>
              </div>
              <p className={styles.cardDesc}>
                يدعم شركات NOEST, DHD, Conexlog, World Express, Coyote وجميع الشركات العاملة بنظام EcoTrack.
              </p>
              <div className={styles.codeBox}>
                <code>{ecotrackUrl}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(ecotrackUrl, 'ecotrack')}
                  className={styles.copyBtn}
                >
                  {copiedKey === 'ecotrack' ? 'تم النسخ ✓' : 'نسخ الرابط'}
                </button>
              </div>
              <small className={styles.hintText}>
                ألصق الرابط في بوابة الـ Webhook الخاصة بشركة التوصيل التي تتعامل معها.
              </small>
            </div>

            {/* 4. بطاقة الـ SDK للمواقع المخصصة */}
            <div className={styles.integrationCard}>
              <div className={styles.cardTop}>
                <span className={styles.tagPurple}>NPM Package</span>
                <h3>المتاجر المخصصة (Custom React / Next.js)</h3>
              </div>
              <p className={styles.cardDesc}>
                للمواقع المبنية يدوياً لربط استمارة الشراء وأزرار الشحن بأسلوب الـ AutoCapture.
              </p>
              <div className={styles.codeBox}>
                <code>npm i dz-tracking-sdk</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard('npm i dz-tracking-sdk', 'npm')}
                  className={styles.copyBtn}
                >
                  {copiedKey === 'npm' ? 'تم النسخ ✓' : 'نسخ الأمر'}
                </button>
              </div>
              <small className={styles.hintText}>
                شغّل أمر <code>npx dz-tracker init</code> في مشروعك لتتم التهيئة تلقائياً!
              </small>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================
          TAB 3: شاشة مطابقة الحالات وتخصيص اللغة الذكية
         ========================================================= */}
      {activeTab === 'mappings' && (
        <section className={styles.tabContent}>
          <div className={styles.sectionHeadingBox}>
            <h2>تخصيص ومطابقة مسميات الحالات (Status Mapping) 🏷️</h2>
            <p>
              حدد ما يراه زبائنك بالعربية لأي كود حالة قادم من شوبيفاي، شركات الشحن، أو متجرك المخصص دون تعديل برمجياتك:
            </p>
          </div>

          {/* 1. القوالب الجاهزة بنقرة زر واحدة */}
          <div className={styles.presetsCard}>
            <div className={styles.presetText}>
              <h3>تطبيق قوالب معربة جاهزة بضغطة زر ⚡</h3>
              <p>بدلاً من كتابة الحالات يدوياً، حمّل حزمة الترجمة الكاملة الموصى بها لشركتك فوراً:</p>
            </div>
            <div className={styles.presetButtons}>
              {/* 1. زر ياليدين */}
              <form action={async (fd) => {
                const { applyPresetMappings } = await import('./actions');
                await applyPresetMappings(fd);
              }}>
                <input type="hidden" name="merchant_id" value={merchantId} />
                <input type="hidden" name="preset_type" value="yalidine" />
                <button type="submit" className={styles.presetBtnOrange}>
                  + حزمة ياليدين (9 حالات) 🚚
                </button>
              </form>

              {/* 2. زر شبكة إيكوتراك الجديد 🌐 */}
              <form action={async (fd) => {
                const { applyPresetMappings } = await import('./actions');
                await applyPresetMappings(fd);
              }}>
                <input type="hidden" name="merchant_id" value={merchantId} />
                <input type="hidden" name="preset_type" value="ecotrack" />
                <button type="submit" className={styles.presetBtnBlue}>
                  + حزمة إيكوتراك (80+ شركة شحن) 🌐
                </button>
              </form>

              {/* 3. زر شوبيفاي */}
              <form action={async (fd) => {
                const { applyPresetMappings } = await import('./actions');
                await applyPresetMappings(fd);
              }}>
                <input type="hidden" name="merchant_id" value={merchantId} />
                <input type="hidden" name="preset_type" value="shopify" />
                <button type="submit" className={styles.presetBtnGreen}>
                  + حزمة شوبيفاي (5 حالات) 🛍️
                </button>
              </form>
            </div>
          </div>

          {/* 2. استمارة إضافة أو تعديل مطابقة مخصصة */}
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.8rem 0' }}>
              إضافة أو تعديل مطابقة يدوية:
            </h3>
            <MappingForm merchantId={merchantId} />
          </div>

          {/* 3. جدول المطابقات الحالية مع إمكانية الحذف */}
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.8rem 0' }}>
              المطابقات المفعلة حالياً في متجرك ({mappings.length}):
            </h3>

            {mappings.length === 0 ? (
              <div className={styles.emptyState}>
                <p>لا توجد مطابقات مخصصة بعد.</p>
                <small>اضغط على أحد أزرار الحزم الجاهزة بالأعلى لتفعيل الترجمة فوراً!</small>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>كود الحالة الأصلي (Raw Code)</th>
                      <th>ما يظهر للزبون في صفحة التتبع</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => {
                      const isEditing = editingMappingId === m.id;

                      return (
                        <tr key={m.id}>
                          <td className={styles.monoCell}>
                            <code>{m.source_status}</code>
                          </td>

                          {/* إذا كان في وضع التعديل يظهر حقل إدخال، وإلا يظهر النص العادي */}
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editDisplayStatus}
                                onChange={(e) => setEditDisplayStatus(e.target.value)}
                                className={styles.inlineEditInput}
                                autoFocus
                              />
                            ) : (
                              <span className={styles.statusPreviewBadge}>{m.display_status}</span>
                            )}
                          </td>

                          {/* أزرار الإجراءات: حفظ وإلغاء في وضع التعديل، أو تعديل وحذف في الوضع العادي */}
                          <td style={{ textAlign: 'center' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(m.source_status)}
                                  disabled={isSavingEdit}
                                  className={styles.saveEditBtn}
                                >
                                  {isSavingEdit ? '...' : 'حفظ ✓'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingMappingId(null)}
                                  className={styles.cancelEditBtn}
                                >
                                  إلغاء
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMappingId(m.id);
                                    setEditDisplayStatus(m.display_status);
                                  }}
                                  className={styles.editMappingBtn}
                                  title="تعديل هذا المسمى"
                                >
                                  تعديل ✎
                                </button>

                                <form action={async (fd) => {
                                  const { deleteStatusMapping } = await import('./actions');
                                  await deleteStatusMapping(fd);
                                }}>
                                  <input type="hidden" name="id" value={m.id} />
                                  <button
                                    type="submit"
                                    className={styles.deleteMappingBtn}
                                    title="حذف هذه المطابقة"
                                  >
                                    حذف ✕
                                  </button>
                                </form>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}