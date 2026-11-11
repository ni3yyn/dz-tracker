import { DashboardMetricCard } from '../components/DashboardMetricCard';
import { DashboardSectionHeading } from '../components/DashboardSectionHeading';
import { Icons } from '../components/DashboardIcons';
import type { ShipmentListFilter } from '../features/orders/order-types';

type OverviewOrder = {
  id: string;
  customer_name: string | null;
  external_order_id: string;
  current_status: string;
  carrier_name: string | null;
  created_at: string;
};

type OverviewTabDestination = 'branding' | 'integrations';

interface OverviewTabProps {
  orderCount: number;
  inTransitCount: number;
  stopdeskCount: number;
  deliveredCount: number;
  returnedCount: number;
  exceptionCount: number;
  exceptionOrders: OverviewOrder[];
  recentOrders: OverviewOrder[];
  getStatusLabel: (status: string) => string;
  getStatusBadgeStyle: (status: string) => string;
  formatOrderDate: (value: string) => string;
  onOpenShipmentList: (filter: ShipmentListFilter, query?: string) => void;
  onNavigateTab: (tab: OverviewTabDestination) => void;
}

export function OverviewTab({
  orderCount,
  inTransitCount,
  stopdeskCount,
  deliveredCount,
  returnedCount,
  exceptionCount,
  exceptionOrders,
  recentOrders,
  getStatusLabel,
  getStatusBadgeStyle,
  formatOrderDate,
  onOpenShipmentList,
  onNavigateTab,
}: OverviewTabProps) {
  return (
            <section className="dz-overview" aria-label="نظرة عامة على الشحنات">
              <div className="dz-overview-kpis" aria-label="ملخص الشحنات">
                <DashboardMetricCard as="button" label="إجمالي الشحنات" value={orderCount} onClick={() => onOpenShipmentList('all')} />
                <DashboardMetricCard as="button" label="في الطريق" value={inTransitCount} onClick={() => onOpenShipmentList('transit')} />
                <DashboardMetricCard as="button" label="نقطة الاستلام" value={stopdeskCount} onClick={() => onOpenShipmentList('stopdesk')} />
                <DashboardMetricCard as="button" label="تم التسليم" value={deliveredCount} onClick={() => onOpenShipmentList('delivered')} />
              </div>

              {orderCount === 0 && (
                <section className="dz-setup-empty" aria-labelledby="dz-setup-empty-title">
                  <div className="dz-setup-empty-intro">
                    <span className="dz-setup-eyebrow">ابدأ من هنا <i>·</i> 3 خطوات واضحة</span>
                    <h2 id="dz-setup-empty-title">خلّي أول طلب يوصل إلى تاجر تراك</h2>
                    <p>ما تسجّل حتى طلب لحد الآن. اختَر طريقة الربط المناسبة، وبعدها قرّر إذا تحب حالات الشحن تتحدّث من شركة التوصيل تلقائياً أو تحدّثها بنفسك.</p>
                    <button type="button" className="dz-setup-primary" onClick={() => { onNavigateTab('integrations'); }}>افتح دليل الربط <span aria-hidden="true">←</span></button>
                  </div>
                  <div className="dz-setup-steps">
                    <button type="button" className="dz-setup-step" onClick={() => { onNavigateTab('integrations'); }}>
                      <span className="dz-setup-step-no">01</span><span><strong>اربط مصدر الطلبات</strong><small>Shopify أو موقع مبرمج خصيصاً</small></span><span className="dz-setup-step-arrow">↙</span>
                    </button>
                    <button type="button" className="dz-setup-step" onClick={() => { onNavigateTab('integrations'); }}>
                      <span className="dz-setup-step-no">02</span><span><strong>اربط شركات التوصيل التي تستخدمها</strong><small>اربط أكثر من شركة دون استبدال اتصال موجود</small></span><span className="dz-setup-step-arrow">↙</span>
                    </button>
                    <button type="button" className="dz-setup-step" onClick={() => { onNavigateTab('branding'); }}>
                      <span className="dz-setup-step-no">03</span><span><strong>جهّز صفحة التتبع</strong><small>عدّل الهوية قبل مشاركة الرابط مع الزبائن</small></span><span className="dz-setup-step-arrow">↙</span>
                    </button>
                  </div>
                </section>
              )}

              <div className="dz-overview-grid">
                <div className="dz-overview-main">
                  <section className="dz-overview-section" aria-labelledby="overview-attention-title">
                    <DashboardSectionHeading
                      id="overview-attention-title"
                      title="تحتاج إلى متابعة"
                      description="الشحنات التي اكتُشف فيها خروج عن المسار المتوقع"
                      action={exceptionCount > 0 && <button type="button" className="dz-overview-text-link" onClick={() => onOpenShipmentList('exceptions')}>عرض الكل ({exceptionCount})</button>}
                    />
                    {exceptionOrders.length === 0 ? (
                      <div className="dz-overview-empty">لا توجد استثناءات نشطة حالياً.</div>
                    ) : exceptionOrders.slice(0, 5).map((order) => (
                      <div className="dz-overview-item" key={`attention-${order.id}`}>
                        <div className="dz-overview-item-main">
                          <span className="dz-overview-item-mark" aria-hidden="true" />
                          <div className="dz-overview-item-copy">
                            <strong>{order.customer_name || 'عميل'} <span style={{ color: 'var(--ink-muted)', fontWeight: 550 }}>· {order.external_order_id}</span></strong>
                            <span>{getStatusLabel(order.current_status)}{order.carrier_name ? ` · ${order.carrier_name}` : ''}</span>
                          </div>
                        </div>
                        <div className="dz-overview-item-meta">
                          <time dateTime={order.created_at}>{formatOrderDate(order.created_at)}</time>
                          <button type="button" className="dz-overview-item-action" onClick={() => onOpenShipmentList('all', order.external_order_id)}>مراجعة</button>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="dz-overview-section" aria-labelledby="overview-recent-title">
                    <DashboardSectionHeading
                      id="overview-recent-title"
                      title="أحدث الشحنات المسجلة"
                      description="مرتبة حسب تاريخ تسجيل الطلب، وليس حسب آخر تحديث للناقل"
                      action={<button type="button" className="dz-overview-text-link" onClick={() => onOpenShipmentList('all')}>كل الشحنات</button>}
                    />
                    {recentOrders.length === 0 ? (
                      <div className="dz-overview-empty">لا توجد شحنات بعد. عند وصول أول طلب سيظهر هنا.</div>
                    ) : recentOrders.map((order) => {
                      const kind = getStatusBadgeStyle(order.current_status);
                      return (
                        <div className="dz-overview-item" key={`recent-${order.id}`}>
                          <div className="dz-overview-item-main">
                            <span className={`dz-overview-item-mark ${kind === 'success' ? 'is-delivered' : kind === 'info' ? 'is-moving' : ''}`} aria-hidden="true" />
                            <div className="dz-overview-item-copy">
                              <strong>{order.customer_name || 'عميل'} <span style={{ color: 'var(--ink-muted)', fontWeight: 550 }}>· {order.external_order_id}</span></strong>
                              <span>{getStatusLabel(order.current_status)}{order.carrier_name ? ` · ${order.carrier_name}` : ''}</span>
                            </div>
                          </div>
                          <div className="dz-overview-item-meta">
                            <time dateTime={order.created_at}>{formatOrderDate(order.created_at)}</time>
                            <button type="button" className="dz-overview-item-action" onClick={() => onOpenShipmentList('all', order.external_order_id)}>فتح</button>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                </div>

                <aside className="dz-overview-aside" aria-label="اختصارات">
                  <section className="dz-overview-section">
                    <DashboardSectionHeading title="اختصارات" description="الإجراءات التي تستخدمها يومياً" />
                    <div className="dz-overview-actions">
                      <button type="button" className="dz-overview-action" onClick={() => onOpenShipmentList('all')}>
                        <span className="dz-overview-action-icon"><Icons.Box /></span>
                        <span className="dz-overview-action-copy"><strong>كل الشحنات</strong><small>بحث وتصفية وتحديث الحالة</small></span>
                      </button>
                      <button type="button" className="dz-overview-action" onClick={() => onOpenShipmentList('exceptions')}>
                        <span className="dz-overview-action-icon"><Icons.AlertTriangle /></span>
                        <span className="dz-overview-action-copy"><strong>استثناءات الشحن</strong><small>{exceptionCount ? `${exceptionCount} شحنة تحتاج إلى مراجعة` : 'لا توجد تنبيهات حالياً'}</small></span>
                      </button>
                      <button type="button" className="dz-overview-action" onClick={() => { onNavigateTab('branding'); }}>
                        <span className="dz-overview-action-icon"><Icons.Palette /></span>
                        <span className="dz-overview-action-copy"><strong>صفحة تتبع متجرك</strong><small>تعديل المظهر والرسائل وخيارات الدعم</small></span>
                      </button>
                      <button type="button" className="dz-overview-action" onClick={() => { onNavigateTab('integrations'); }}>
                        <span className="dz-overview-action-icon"><Icons.Plug /></span>
                        <span className="dz-overview-action-copy"><strong>بوابات الربط</strong><small>دليل إعداد خطوة بخطوة حسب متجرك</small></span>
                      </button>
                    </div>
                  </section>
                  <section className="dz-overview-section">
                    <DashboardSectionHeading title="ملخص التشغيل" description="حالات الشحن الحالية" />
                    <div className="dz-overview-item"><div className="dz-overview-item-main"><span className="dz-overview-item-mark is-moving" /><div className="dz-overview-item-copy"><strong>في الطريق</strong><span>تشمل الشحنات المرسلة أو الخارجة للتوصيل</span></div></div><strong>{inTransitCount}</strong></div>
                    <div className="dz-overview-item"><div className="dz-overview-item-main"><span className="dz-overview-item-mark" style={{ background: '#a58b56', boxShadow: '0 0 0 4px rgba(165,139,86,.1)' }} /><div className="dz-overview-item-copy"><strong>نقطة الاستلام</strong><span>جاهزة للاستلام من المكتب</span></div></div><strong>{stopdeskCount}</strong></div>
                    <div className="dz-overview-item"><div className="dz-overview-item-main"><span className="dz-overview-item-mark is-delivered" /><div className="dz-overview-item-copy"><strong>مرتجعة أو ملغاة</strong><span>شحنات أُغلقت دون تسليم</span></div></div><strong>{returnedCount}</strong></div>
                  </section>
                </aside>
              </div>
            </section>
  );
}
