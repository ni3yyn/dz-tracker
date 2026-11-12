import type { Dispatch, SetStateAction } from 'react';
import type { MerchantDashboardTab } from '../dashboard/DashboardSidebar';
import { BrandedSelect } from '../BrandedSelect';
import { StatusSelector } from '../StatusSelector';
import { Icons } from '../components/DashboardIcons';
import { DashboardMetricCard } from '../components/DashboardMetricCard';
import { DashboardFilterTabs } from '../components/DashboardFilterTabs';
import type {
  OrderItem,
  OrderSort as OrdersSort,
  OrderStatusFilter as OrdersStatusFilter,
  ShipmentListFilter,
} from '../features/orders/order-types';

interface OrdersTabProps {
  orders: OrderItem[];
  filteredOrders: OrderItem[];
  inTransitCount: number;
  stopdeskCount: number;
  deliveredCount: number;
  exceptionCount: number;
  exceptionOrderIds: Set<string>;
  visibleOrders: number;
  onVisibleOrdersChange: Dispatch<SetStateAction<number>>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: OrdersStatusFilter;
  onStatusFilterChange: (value: OrdersStatusFilter) => void;
  carrierFilter: string;
  onCarrierFilterChange: (value: string) => void;
  uniqueCarriers: string[];
  sortBy: OrdersSort;
  onSortByChange: (value: OrdersSort) => void;
  activeTab: MerchantDashboardTab;
  onActiveTabChange: (tab: MerchantDashboardTab) => void;
  allFilteredOrdersSelected: boolean;
  selectedOrderIds: string[];
  isDeletingOrders: boolean;
  onToggleFilteredOrderSelection: (checked: boolean) => void;
  onToggleOrderSelection: (orderId: string, checked: boolean) => void;
  onDeleteOrders: (orderIds: string[]) => Promise<void>;
  onClearSelection: () => void;
  onAddOrder: () => void;
  onOpenOrder: (orderId: string) => void;
  onOpenShipmentList: (filter: ShipmentListFilter, query?: string) => void;
  onCloseMobileMenu: () => void;
  onCopyToClipboard: (value: string, id: string) => void;
  copiedKey: string | null;
  getStatusLabel: (status: string) => string;
  getStatusBadgeStyle: (status: string) => string;
  formatOrderDate: (value: string) => string;
  formatOrderTime: (value: string) => string;
  getWhatsAppRecoveryUrl: (order: OrderItem) => string;
}

export function OrdersTab({
  orders,
  filteredOrders,
  inTransitCount,
  stopdeskCount,
  deliveredCount,
  exceptionCount,
  exceptionOrderIds,
  visibleOrders,
  onVisibleOrdersChange,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  carrierFilter,
  onCarrierFilterChange,
  uniqueCarriers,
  sortBy,
  onSortByChange,
  activeTab,
  onActiveTabChange,
  allFilteredOrdersSelected,
  selectedOrderIds,
  isDeletingOrders,
  onToggleFilteredOrderSelection,
  onToggleOrderSelection,
  onDeleteOrders,
  onClearSelection,
  onAddOrder,
  onOpenOrder,
  onOpenShipmentList,
  onCloseMobileMenu,
  onCopyToClipboard,
  copiedKey,
  getStatusLabel,
  getStatusBadgeStyle,
  formatOrderDate,
  formatOrderTime,
  getWhatsAppRecoveryUrl,
}: OrdersTabProps) {
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const currentPage = Math.min(Math.max(1, visibleOrders), pageCount);
  const pageOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisibleOrder = filteredOrders.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastVisibleOrder = Math.min(currentPage * pageSize, filteredOrders.length);

  return (
            <div>
              <div className="dz-stats-bar dz-orders-desktop-summary" aria-label="ملخص الشحنات">
                <DashboardMetricCard as="button" className="dz-stat-item" labelClassName="dz-stat-title" valueClassName="dz-stat-value" label="إجمالي الشحنات" value={orders.length} onClick={() => onOpenShipmentList('all')} />
                <DashboardMetricCard as="button" className="dz-stat-item" labelClassName="dz-stat-title" valueClassName="dz-stat-value" label="في الطريق" value={inTransitCount} onClick={() => onOpenShipmentList('transit')} />
                <DashboardMetricCard as="button" className="dz-stat-item" labelClassName="dz-stat-title" valueClassName="dz-stat-value" label="نقطة الاستلام" value={stopdeskCount} onClick={() => onOpenShipmentList('stopdesk')} />
                <DashboardMetricCard as="button" className="dz-stat-item" labelClassName="dz-stat-title" valueClassName="dz-stat-value" label="تم التسليم" value={deliveredCount} onClick={() => onOpenShipmentList('delivered')} />
              </div>

              <div className="dz-filter-row dz-shipment-filters dz-orders-filter-row">
                <DashboardFilterTabs
                  className="dz-shipment-status-tabs dz-orders-status-tabs"
                  ariaLabel="تصفية حسب حالة الشحنة"
                  items={[
                    { value: 'all', label: 'الكل', active: statusFilter === 'all' && activeTab === 'orders', onSelect: () => { onStatusFilterChange('all'); if (activeTab !== 'orders') onActiveTabChange('orders'); } },
                    { value: 'transit', label: 'في الطريق', active: statusFilter === 'transit', onSelect: () => { onActiveTabChange('orders'); onStatusFilterChange('transit'); } },
                    { value: 'stopdesk', label: 'نقطة الاستلام', active: statusFilter === 'stopdesk', onSelect: () => { onActiveTabChange('orders'); onStatusFilterChange('stopdesk'); } },
                    { value: 'exceptions', label: 'استثناءات', count: exceptionCount, active: false, onSelect: () => { onActiveTabChange('exceptions'); onStatusFilterChange('all'); onCloseMobileMenu(); } },
                    { value: 'exchange', label: 'الاستبدال', count: orders.filter((order) => order.exchange_status === 'awaiting_shipment' || order.exchange_status === 'replacement_in_transit').length, active: statusFilter === 'exchange', onSelect: () => { onActiveTabChange('orders'); onStatusFilterChange('exchange'); } },
                    { value: 'delivered', label: 'تم التسليم', active: statusFilter === 'delivered', onSelect: () => { onActiveTabChange('orders'); onStatusFilterChange('delivered'); } },
                    { value: 'returned', label: 'مرتجع', active: statusFilter === 'returned', onSelect: () => { onActiveTabChange('orders'); onStatusFilterChange('returned'); } },
                  ]}
                />
                <div className="dz-shipment-filter-controls dz-orders-filter-controls">
                  <label className="dz-shipment-search-wrap" role="search">
                    <span className="sr-only">البحث في الشحنات برقم الطلب أو الهاتف أو اسم العميل</span>
                    <Icons.Search />
                    <input
                      type="search"
                      aria-label="البحث في الشحنات برقم الطلب أو الهاتف أو اسم العميل"
                      placeholder="رقم الطلب، الهاتف، العميل..."
                      value={searchTerm}
                      onChange={(event) => onSearchTermChange(event.target.value)}
                    />
                  </label>
                  <div className="dz-shipment-select-wrap">
                    <BrandedSelect
                      ariaLabel="تصفية حسب شركة الشحن"
                      value={carrierFilter}
                      onChange={onCarrierFilterChange}
                      variant="compact"
                      options={[
                        { value: 'all', label: 'كل شركات الشحن' },
                        ...uniqueCarriers.map((carrier) => ({ value: carrier, label: carrier })),
                      ]}
                    />
                  </div>
                  <div className="dz-shipment-select-wrap">
                    <BrandedSelect
                      ariaLabel="ترتيب الشحنات"
                      value={sortBy}
                      onChange={(value) => onSortByChange(value as 'newest' | 'oldest' | 'risk')}
                      variant="compact"
                      options={[
                        { value: 'newest', label: 'الأحدث أولاً' },
                        { value: 'risk', label: 'الأكثر خطورة' },
                        { value: 'oldest', label: 'الأقدم أولاً' },
                      ]}
                    />
                  </div>
                  {(searchTerm || statusFilter !== 'all' || carrierFilter !== 'all' || sortBy !== 'newest') && (
                    <button type="button" className="dz-filter-btn dz-filter-reset" onClick={() => { onSearchTermChange(''); onStatusFilterChange('all'); onCarrierFilterChange('all'); onSortByChange('newest'); onActiveTabChange('orders'); }}>مسح الفلاتر</button>
                  )}
                </div>
              </div>

              {filteredOrders.length > 0 && (
                <div className="dz-bulk-select-toolbar" role="group" aria-label="إجراءات الحذف الجماعي">
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allFilteredOrdersSelected}
                      disabled={isDeletingOrders}
                      onChange={(event) => onToggleFilteredOrderSelection(event.target.checked)}
                    />
                    تحديد كل النتائج ({filteredOrders.length})
                  </label>
                  {selectedOrderIds.length > 0 && (
                    <>
                      <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                        تم تحديد {selectedOrderIds.length} طلب
                      </span>
                      <button
                        type="button"
                        className="dz-btn"
                        disabled={isDeletingOrders}
                        onClick={() => void onDeleteOrders(selectedOrderIds)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '8px 12px',
                          fontSize: 12,
                          background: '#dc2626',
                          color: '#fff',
                          borderColor: '#dc2626',
                          opacity: isDeletingOrders ? 0.65 : 1,
                        }}
                      >
                        <Icons.Trash />
                        {isDeletingOrders ? 'جارٍ الحذف...' : `حذف المحدد (${selectedOrderIds.length})`}
                      </button>
                      <button
                        type="button"
                        className="dz-btn dz-btn-outline"
                        disabled={isDeletingOrders}
                        onClick={() => onClearSelection()}
                        style={{ padding: '8px 12px', fontSize: 12 }}
                      >
                        إلغاء التحديد
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="dz-table-wrap dz-orders-desktop">
                <div className="dz-table-header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 750, color: 'var(--ink-main)' }}>قائمة الشحنات</h3>
                    <span className="dz-overview-section-subtitle">بيانات الطلب والعميل والحالة التشغيلية</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="dz-add-order-btn"
                      onClick={() => {
                        onAddOrder();
                      }}
                    >
                      <Icons.Plus />
                      <span>إضافة طلب جديد</span>
                    </button>
                    <span className="dz-orders-count">{filteredOrders.length} نتيجة من {orders.length}</span>
                  </div>
                </div>
                <div className="dz-table-scroll">
                  <table className="dz-orders-table">
                    <colgroup>
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '35%' }} />
                      <col style={{ width: '12%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="dz-order-select-cell" aria-label="تحديد الطلبات" />
                        <th className="dz-order-date-cell">التاريخ</th>
                        <th>العميل</th>
                        <th>شركة الشحن</th>
                        <th>الحالة</th>
                        <th>الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--ink-muted)' }}>{orders.length === 0 ? 'لا توجد شحنات مسجلة بعد.' : 'لا توجد نتائج تطابق البحث والفلاتر الحالية.'}</td></tr>
                      ) : pageOrders.map((order) => {
                        const isAlert = exceptionOrderIds.has(order.id);
                        return (
                          <tr
                            key={order.id}
                            className={isAlert ? 'row-alert dz-order-clickable-row' : 'dz-order-clickable-row'}
                            tabIndex={0}
                            aria-label={'فتح تفاصيل الشحنة ' + order.external_order_id}
                            onClick={(event) => {
                              const target = event.target;
                              if (target instanceof Element && target.closest('button, a, input, select, textarea, label, [role="button"], [role="img"]')) return;
                              onOpenOrder(order.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                              event.preventDefault();
                              onOpenOrder(order.id);
                            }}
                          >
                            <td className="dz-order-select-cell">
                              <input
                                type="checkbox"
                                aria-label={`تحديد الطلب ${order.external_order_id}`}
                                checked={selectedOrderIds.includes(order.id)}
                                disabled={isDeletingOrders}
                                onChange={(event) => onToggleOrderSelection(order.id, event.target.checked)}
                              />
                            </td>
                            <td className="dz-order-date-cell">
                              <div className="dz-order-date-value">
                                <strong>{formatOrderDate(order.created_at)}</strong>
                                <span>{formatOrderTime(order.created_at)}</span>
                              </div>
                            </td>
                            <td>
                              <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>{order.customer_name || 'عميل'}</strong>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--ink-muted)', direction: 'ltr' }}>{order.customer_phone || 'لا يوجد هاتف'}</span>
                                {order.customer_phone && <button type="button" aria-label="نسخ رقم العميل" className="dz-icon-btn" onClick={() => onCopyToClipboard(order.customer_phone!, `ph_${order.id}`)}>{copiedKey === `ph_${order.id}` ? <Icons.Check /> : <Icons.Copy />}</button>}
                              </div>
                            </td>
                            <td className="dz-order-carrier-cell">
                              <strong className="dz-order-reference">{order.external_order_id}</strong>
                              <div className="dz-order-carrier-name">{order.carrier_name || 'غير محدد'}</div>
                              <span className="dz-order-tracking-number">{order.carrier_tracking_number || 'لا يوجد رقم تتبع'}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                                {order.confirmation_status === 'pending' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(234,179,8,0.1)', color: '#92400e', fontWeight: 600 }}>بانتظار تأكيد العميل</span>}
                                {order.confirmation_status === 'confirmed' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(21,128,61,0.1)', color: '#15803d', fontWeight: 600 }}>أكد العميل الطلب</span>}
                                {order.confirmation_status === 'cancelled' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 600 }}>طلب العميل إلغاء الطلب</span>}
                                {order.exchange_status === 'awaiting_shipment' && <span style={{ color: '#a36b22', fontSize: 11, fontWeight: 800 }}>بانتظار الاستبدال</span>}
                                {order.exchange_status === 'replacement_in_transit' && <span style={{ color: '#267548', fontSize: 11, fontWeight: 800 }}>شحنة الاستبدال في الطريق</span>}
                                <StatusSelector orderId={order.id} currentStatus={order.current_status} />
                              </div>
                            </td>
                            <td style={{ minWidth: 116 }}>
                              <div className="dz-order-action-grid" role="group" aria-label={`إجراءات الطلب ${order.external_order_id}`}>
                                <button
                                  type="button"
                                  className="dz-order-action-btn"
                                  aria-label={`تفاصيل الطلب ${order.external_order_id}`}
                                  title="تفاصيل الطلب"
                                  onClick={() => onOpenOrder(order.id)}
                                >
                                  <Icons.Eye />
                                </button>
                                <a
                                  href={`/t/${order.tracking_uuid}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="dz-order-action-btn"
                                  aria-label={`فتح صفحة تتبع ${order.external_order_id}`}
                                  title="صفحة التتبع"
                                >
                                  <Icons.ExternalLink />
                                </a>
                                {order.customer_phone ? (
                                  <a
                                    href={getWhatsAppRecoveryUrl(order)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`dz-order-action-btn dz-order-action-whatsapp ${isAlert ? 'is-urgent' : ''}`}
                                    aria-label="التواصل مع العميل عبر واتساب"
                                    title="واتساب"
                                  >
                                    <Icons.WhatsApp />
                                  </a>
                                ) : (
                                  <span className="dz-order-action-btn is-disabled" role="img" aria-label="رقم العميل غير متوفر" title="رقم العميل غير متوفر">
                                    <Icons.WhatsApp />
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="dz-order-action-btn dz-order-action-delete"
                                  aria-label={`حذف الطلب ${order.external_order_id}`}
                                  title="حذف الطلب"
                                  disabled={isDeletingOrders}
                                  onClick={() => void onDeleteOrders([order.id])}
                                >
                                  <Icons.Trash />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dz-orders-mobile" aria-label="قائمة الشحنات على الهاتف">
                {filteredOrders.length === 0 ? (
                  <div className="dz-overview-empty">{orders.length === 0 ? 'لا توجد شحنات مسجلة بعد.' : 'لا توجد نتائج تطابق البحث والفلاتر الحالية.'}</div>
                ) : pageOrders.map((order) => {
                  const isAlert = exceptionOrderIds.has(order.id);
                  const badgeStyle = getStatusBadgeStyle(order.current_status);
                  return (
                    <article key={`mobile-${order.id}`} className="dz-order-mobile-card dz-order-clickable-card"
                       tabIndex={0}
                       aria-label={'فتح تفاصيل الشحنة ' + order.external_order_id}
                       onClick={(event) => {
                         const target = event.target;
                         if (target instanceof Element && target.closest('button, a, input, select, textarea, label, [role="button"], [role="img"]')) return;
                         onOpenOrder(order.id);
                       }}
                       onKeyDown={(event) => {
                         if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                         event.preventDefault();
                         onOpenOrder(order.id);
                       }}>
                      <label className="dz-order-mobile-select">
                        <input
                          type="checkbox"
                          aria-label={`تحديد الطلب ${order.external_order_id}`}
                          checked={selectedOrderIds.includes(order.id)}
                          disabled={isDeletingOrders}
                          onChange={(event) => onToggleOrderSelection(order.id, event.target.checked)}
                        />
                        تحديد الطلب
                      </label>
                      <div className="dz-order-mobile-top">
                        <div className="dz-order-mobile-number"><strong>{formatOrderDate(order.created_at)}</strong><small>{formatOrderTime(order.created_at)}</small></div>
                        <div className="dz-order-mobile-badges">
                          {order.confirmation_status === 'pending' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(234,179,8,0.1)', color: '#92400e', fontWeight: 600, whiteSpace: 'nowrap' }}>بانتظار تأكيد العميل</span>}
                          {order.confirmation_status === 'confirmed' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(21,128,61,0.1)', color: '#15803d', fontWeight: 600, whiteSpace: 'nowrap' }}>أكد العميل الطلب</span>}
                          {order.confirmation_status === 'cancelled' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>طلب العميل إلغاء الطلب</span>}
                          <span className={`dz-pill dz-pill-${badgeStyle}`}>الشحنة: {getStatusLabel(order.current_status)}</span>
                        </div>
                      </div>
                      <div className="dz-order-mobile-customer">{order.customer_name || 'عميل'}</div>
                      <div className="dz-order-mobile-phone">
                        <span>{order.customer_phone || 'لا يوجد رقم هاتف'}</span>
                        {order.customer_phone && <button type="button" aria-label="نسخ رقم العميل" className="dz-icon-btn" onClick={() => onCopyToClipboard(order.customer_phone!, `mobile-ph_${order.id}`)}>{copiedKey === `mobile-ph_${order.id}` ? <Icons.Check /> : <Icons.Copy />}</button>}
                      </div>
                      <div className="dz-order-mobile-meta">
                         <span>{order.carrier_name || 'شركة الشحن غير محددة'}</span>
                         <span>رقم الطلب: <bdi dir="ltr">{order.external_order_id}</bdi></span>
                         <span>{order.carrier_tracking_number || 'لا يوجد رقم تتبع'}</span>
                       </div>
                      <div className="dz-order-mobile-status"><StatusSelector orderId={order.id} currentStatus={order.current_status} /></div>
                      <div className="dz-order-action-grid" role="group" aria-label={`إجراءات الطلب ${order.external_order_id}`}>
                        <button
                          type="button"
                          className="dz-order-action-btn"
                          aria-label={`تفاصيل الطلب ${order.external_order_id}`}
                          title="تفاصيل الطلب"
                          onClick={() => onOpenOrder(order.id)}
                        >
                          <Icons.Eye />
                        </button>
                        <a
                          href={`/t/${order.tracking_uuid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="dz-order-action-btn"
                          aria-label={`فتح صفحة تتبع ${order.external_order_id}`}
                          title="صفحة التتبع"
                        >
                          <Icons.ExternalLink />
                        </a>
                        {order.customer_phone ? (
                          <a
                            href={getWhatsAppRecoveryUrl(order)}
                            target="_blank"
                            rel="noreferrer"
                            className={`dz-order-action-btn dz-order-action-whatsapp ${isAlert ? 'is-urgent' : ''}`}
                            aria-label="التواصل مع العميل عبر واتساب"
                            title="واتساب"
                          >
                            <Icons.WhatsApp />
                          </a>
                        ) : (
                          <span className="dz-order-action-btn is-disabled" role="img" aria-label="رقم العميل غير متوفر" title="رقم العميل غير متوفر">
                            <Icons.WhatsApp />
                          </span>
                        )}
                        <button
                          type="button"
                          className="dz-order-action-btn dz-order-action-delete"
                          aria-label={`حذف الطلب ${order.external_order_id}`}
                          title="حذف الطلب"
                          disabled={isDeletingOrders}
                          onClick={() => void onDeleteOrders([order.id])}
                        >
                          <Icons.Trash />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {pageCount > 1 && (
                <nav className="dz-orders-load-more" aria-label="التنقل بين صفحات الشحنات" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => onVisibleOrdersChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    aria-label="الصفحة السابقة"
                  >
                    السابقة
                  </button>
                  <span aria-live="polite" style={{ color: 'var(--ink-muted)', fontSize: 12, fontWeight: 700 }}>
                    {firstVisibleOrder}–{lastVisibleOrder} من {filteredOrders.length} · صفحة {currentPage} من {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => onVisibleOrdersChange(Math.min(pageCount, currentPage + 1))}
                    disabled={currentPage >= pageCount}
                    aria-label="الصفحة التالية"
                  >
                    التالية
                  </button>
                </nav>
              )}

            </div>
  );
}
