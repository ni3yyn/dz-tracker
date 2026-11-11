'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { OrderDetailField } from './OrderDetailField';
import { Icons } from './DashboardIcons';
import { StatusSelector } from '../StatusSelector';
import type { OrderItem } from '../features/orders/order-types';

export interface OrderDetailsSidePanelHandle {
  open: (orderId: string) => void;
  closeIfDeleted: (orderIds: string[]) => void;
}

interface OrderDetailsSidePanelProps {
  orders: OrderItem[];
  getStatusLabel: (status: string) => string;
  getStatusBadgeStyle: (status: string) => string;
  getWhatsAppRecoveryUrl: (order: OrderItem) => string;
  formatOrderDate: (value: string) => string;
  isAttentionStatus: (status: string) => boolean;
}

/**
 * Keep order-detail interaction state outside the large dashboard component.
 * Opening the side panel must not synchronously rerender the orders table and
 * every dashboard tab.
 */
export const OrderDetailsSidePanel = React.memo(React.forwardRef<OrderDetailsSidePanelHandle, OrderDetailsSidePanelProps>(
  function OrderDetailsSidePanel({ orders, getStatusLabel, getStatusBadgeStyle, getWhatsAppRecoveryUrl, formatOrderDate, isAttentionStatus }, ref) {
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const selectedOrderIdRef = useRef<string | null>(null);
    const openAnimationPendingRef = useRef(false);
    const [isOpen, setIsOpen] = useState(false);
    const selectedOrder = useMemo(
      () => orders.find((order) => order.id === selectedOrderId) || null,
      [orders, selectedOrderId]
    );

    const openPanel = useCallback((orderId: string) => {
      openAnimationPendingRef.current = true;
      selectedOrderIdRef.current = orderId;
      setSelectedOrderId(orderId);
      // Mount the drawer in its closed state first. The opening effect below
      // advances it only after the browser has painted that starting frame.
      setIsOpen(false);
    }, []);
    const closePanel = useCallback(() => {
      openAnimationPendingRef.current = false;
      setIsOpen(false);
    }, []);
    const closeIfDeleted = useCallback((orderIds: string[]) => {
      if (selectedOrderIdRef.current && orderIds.includes(selectedOrderIdRef.current)) {
        closePanel();
      }
    }, [closePanel]);

    React.useImperativeHandle(ref, () => ({ open: openPanel, closeIfDeleted }), [openPanel, closeIfDeleted]);

    useEffect(() => {
      window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
    }, [isOpen, selectedOrderId]);

    useEffect(() => {
      if (!selectedOrder || isOpen || !openAnimationPendingRef.current) return;

      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        // A second frame guarantees the closed clip-path has been committed
        // before switching to the open state, including on first mount.
        secondFrame = window.requestAnimationFrame(() => {
          openAnimationPendingRef.current = false;
          setIsOpen(true);
        });
      });

      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame) window.cancelAnimationFrame(secondFrame);
      };
    }, [selectedOrder, isOpen]);

    useEffect(() => {
      if (!selectedOrderId || !isOpen) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closePanel();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedOrderId, isOpen, closePanel]);

    if (!selectedOrder || typeof document === 'undefined') return null;

    return createPortal((
            <div
              className="dz-order-detail-backdrop dz-order-details-backdrop"
              data-dashboard-back-dismiss="order-details-panel"
              data-open={isOpen ? 'true' : 'false'}
              aria-hidden={!isOpen}
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && isOpen) closePanel();
              }}
            >
              <aside
                className="dz-order-detail-panel dz-order-details-panel"
                data-open={isOpen ? 'true' : 'false'}
                role="dialog"
                aria-modal="true"
                aria-hidden={!isOpen}
                aria-labelledby="order-detail-title"
                onTransitionEnd={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.propertyName === 'clip-path' || event.propertyName === '-webkit-clip-path') &&
                    !isOpen
                  ) {
                    selectedOrderIdRef.current = null;
                    setSelectedOrderId(null);
                  }
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="dz-order-side-panel-inner dz-order-side-panel-inner--details">
                <div className="dz-order-detail-head">
                  <div>
                    <span className="dz-order-detail-kicker">تفاصيل الشحنة</span>
                    <h2 id="order-detail-title">{selectedOrder.external_order_id}</h2>
                    <p>{selectedOrder.customer_name || 'عميل'} · {formatOrderDate(selectedOrder.created_at)}</p>
                  </div>
                  <button type="button" className="dz-order-detail-close" aria-label="إغلاق التفاصيل" onClick={closePanel}><Icons.X /></button>
                </div>
                <div className="dz-order-detail-status">
                  <div><small>الحالة الحالية</small><strong>{getStatusLabel(selectedOrder.current_status)}</strong></div>
                  <span className={`dz-pill dz-pill-${getStatusBadgeStyle(selectedOrder.current_status)}`}>{isAttentionStatus(selectedOrder.current_status) ? 'تحتاج إلى متابعة' : getStatusLabel(selectedOrder.current_status)}</span>
                </div>
                <div className="dz-order-detail-fields">
                  <OrderDetailField label="اسم العميل">{selectedOrder.customer_name || 'غير متوفر'}</OrderDetailField>
                  <OrderDetailField label="رقم الهاتف" dir="ltr">{selectedOrder.customer_phone || 'غير متوفر'}</OrderDetailField>
                  <OrderDetailField label="اسم الطرد / المنتجات">{selectedOrder.product_name || 'غير متوفر'}</OrderDetailField>
                  <OrderDetailField label="شركة الشحن">{selectedOrder.carrier_name || 'غير محددة'}</OrderDetailField>
                  <OrderDetailField label="رقم التتبع">{selectedOrder.carrier_tracking_number || 'غير متوفر'}</OrderDetailField>
                  {selectedOrder.carrier_name === 'Maystro Delivery' && selectedOrder.carrier_order_id && (
                    <OrderDetailField label="معرّف الطلب لدى Maystro" dir="ltr">{selectedOrder.carrier_order_id}</OrderDetailField>
                  )}
                  {selectedOrder.carrier_name === 'Maystro Delivery' && selectedOrder.carrier_metadata && (
                    <>
                      <OrderDetailField label="الولاية">{selectedOrder.carrier_metadata.wilaya || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="البلدية">{selectedOrder.carrier_metadata.communeName || selectedOrder.carrier_metadata.commune || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="العنوان">{selectedOrder.carrier_metadata.destinationText || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="نوع التوصيل">{Number(selectedOrder.carrier_metadata.deliveryType) === 1 ? 'توصيل إلى المنزل' : Number(selectedOrder.carrier_metadata.deliveryType) === 2 ? 'مكتب / Stopdesk' : Number(selectedOrder.carrier_metadata.deliveryType) === 3 ? 'نقطة استلام' : 'غير محدد'}</OrderDetailField>
                      <OrderDetailField label="المبلغ الإجمالي لدى Maystro">{selectedOrder.carrier_metadata.totalPrice != null ? `${selectedOrder.carrier_metadata.totalPrice} دج` : 'غير متوفر'}</OrderDetailField>
                      {selectedOrder.carrier_metadata.customerPhone2 && (
                        <OrderDetailField label="رقم الهاتف الإضافي" dir="ltr">{selectedOrder.carrier_metadata.customerPhone2}</OrderDetailField>
                      )}
                      {Array.isArray(selectedOrder.carrier_metadata.products) && selectedOrder.carrier_metadata.products.length > 0 && (
                        <OrderDetailField label="تفاصيل محتويات الطرد" style={{ gridColumn: '1 / -1' }} valueStyle={{ display: 'grid', gap: '6px', fontWeight: 650 }}>
                            {selectedOrder.carrier_metadata.products.map((item: any, index: number) => (
                              <span key={index}>
                                {item.description || item.product || 'منتج'}
                                {item.quantity ? ` × ${item.quantity}` : ''}
                                {item.unitPrice != null ? ` · ${item.unitPrice} دج` : ''}
                              </span>
                            ))}
                        </OrderDetailField>
                      )}

                    </>
                  )}
                  {selectedOrder.carrier_name === 'Zimou Express' && selectedOrder.carrier_metadata && (
                    <>
                      <OrderDetailField label="معرّف الطرد لدى Zimou" dir="ltr">{selectedOrder.carrier_order_id || selectedOrder.carrier_metadata.zimouPackageId || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="الولاية">{selectedOrder.carrier_metadata.wilaya || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="البلدية">{selectedOrder.carrier_metadata.commune || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="عنوان التوصيل">{selectedOrder.carrier_metadata.address || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="شركة التوصيل الشريكة">{selectedOrder.carrier_metadata.partnerCompany || 'لم يتم تعيينها بعد'}</OrderDetailField>
                      <OrderDetailField label="رقم تتبع الشركة الشريكة" dir="ltr">{selectedOrder.carrier_metadata.partnerTrackingCode || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="الحالة الأصلية لدى Zimou">{selectedOrder.carrier_metadata.statusName || selectedOrder.carrier_metadata.statusId || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="نوع التوصيل">{selectedOrder.carrier_metadata.deliveryType || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="سعر التوصيل">{selectedOrder.carrier_metadata.deliveryPrice != null ? `${selectedOrder.carrier_metadata.deliveryPrice} دج` : 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="مبلغ التحصيل">{selectedOrder.carrier_metadata.codAmount != null ? `${selectedOrder.carrier_metadata.codAmount} دج` : 'غير متوفر'}</OrderDetailField>
                    </>
                  )}
                  {selectedOrder.carrier_name === 'E-com Delivery v2' && selectedOrder.carrier_metadata?.ecomV2 && (
                    <>
                      <OrderDetailField label="رقم التتبع لدى E-com Delivery" dir="ltr">{selectedOrder.carrier_metadata.ecomV2.trackingNumber || selectedOrder.carrier_tracking_number || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="الولاية">{selectedOrder.carrier_metadata.ecomV2.wilayaId || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="البلدية">{selectedOrder.carrier_metadata.ecomV2.commune || '—'}</OrderDetailField>
                      <OrderDetailField label="مكتب الاستلام">{selectedOrder.carrier_metadata.ecomV2.stopDeskId || '—'}</OrderDetailField>
                      <OrderDetailField label="عنوان التوصيل">{selectedOrder.carrier_metadata.ecomV2.address || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="مبلغ التحصيل">{selectedOrder.carrier_metadata.ecomV2.codAmount != null ? Number(selectedOrder.carrier_metadata.ecomV2.codAmount).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="سعر التوصيل">{selectedOrder.carrier_metadata.ecomV2.shippingFee != null ? Number(selectedOrder.carrier_metadata.ecomV2.shippingFee).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="طريقة التوصيل">{selectedOrder.carrier_metadata.ecomV2.deliveryType === 'stopdesk' ? 'مكتب استلام' : 'توصيل إلى المنزل'}</OrderDetailField>
                      <OrderDetailField label="آخر حالة أصلية">{selectedOrder.carrier_metadata.rawSituation || selectedOrder.carrier_metadata.ecomV2.rawSituation || 'بانتظار أول تحديث'}</OrderDetailField>
                    </>
                  )}
                  {selectedOrder.carrier_name === 'Elogistia' && selectedOrder.carrier_metadata?.elogistia && (
                    <>
                      <OrderDetailField label="رقم التتبع لدى Elogistia" dir="ltr">{selectedOrder.carrier_metadata.elogistia.trackingNumber || selectedOrder.carrier_tracking_number || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="الولاية">{selectedOrder.carrier_metadata.elogistia.wilayaName || selectedOrder.carrier_metadata.elogistia.wilayaId || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="البلدية">{selectedOrder.carrier_metadata.elogistia.commune || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="عنوان التوصيل">{selectedOrder.carrier_metadata.elogistia.address || 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="مبلغ التحصيل">{selectedOrder.carrier_metadata.elogistia.codAmount != null ? Number(selectedOrder.carrier_metadata.elogistia.codAmount).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="سعر التوصيل لدى Elogistia">{selectedOrder.carrier_metadata.elogistia.shippingFee != null ? Number(selectedOrder.carrier_metadata.elogistia.shippingFee).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</OrderDetailField>
                      <OrderDetailField label="طريقة التوصيل">{selectedOrder.carrier_metadata.elogistia.deliveryType === 'stopdesk' ? 'مكتب Elogistia' : 'توصيل إلى المنزل'}</OrderDetailField>
                      <OrderDetailField label="نوع العملية">{selectedOrder.carrier_metadata.elogistia.deliveryMode === 'exchange' ? 'تبادل' : 'إرسال عادي'}</OrderDetailField>
                      <OrderDetailField label="آخر حالة أصلية">{selectedOrder.carrier_metadata.rawStatus || 'بانتظار أول تحديث'}</OrderDetailField>
                    </>
                  )}
                  <OrderDetailField label="تاريخ تسجيل الطلب">{new Date(selectedOrder.created_at).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' })}</OrderDetailField>
                  <OrderDetailField label="معرّف الطلب الداخلي">{selectedOrder.id}</OrderDetailField>
                </div>
                <p className="dz-order-detail-note">يمكنك تعديل الحالة من القائمة أدناه. سجل التحديثات التفصيلي متاح في صفحة التتبع العامة، بينما تعرض هذه اللوحة البيانات المخزنة والمتاحة في لوحة التاجر.</p>
                <div style={{ paddingTop: '17px' }}><span className="dz-order-detail-kicker">تعديل الحالة</span><StatusSelector orderId={selectedOrder.id} currentStatus={selectedOrder.current_status} /></div>
                <div className="dz-order-detail-actions">
                  <a href={`/t/${selectedOrder.tracking_uuid}`} target="_blank" rel="noreferrer" className="dz-btn dz-btn-outline"><Icons.ExternalLink /> صفحة التتبع</a>
                  {selectedOrder.customer_phone && <a href={getWhatsAppRecoveryUrl(selectedOrder)} target="_blank" rel="noreferrer" className={`dz-btn ${isAttentionStatus(selectedOrder.current_status) ? 'dz-btn-wa-urgent' : 'dz-btn-wa'}`}><Icons.MessageCircle /> التواصل عبر واتساب</a>}
                </div>
              </div>
              </aside>
            </div>
    ), document.body);
  }
));
