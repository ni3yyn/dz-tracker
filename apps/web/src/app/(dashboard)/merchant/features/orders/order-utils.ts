import type { OrderItem, OrderStatusFilter } from './order-types';
import type { MappingItem } from '../mappings/mapping-types';

export const isAttentionStatus = (status: string) =>
  status.includes('attempt_failed') || status.includes('alerte') || status === 'postponed';

export const formatOrderDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
};

export const formatOrderTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
};

export const getStatusBadgeStyle = (status: string) => {
  if (status.includes('attempt_failed') || status.includes('alerte') || status === 'postponed') {
    return 'alert';
  }
  if (status === 'delivered') return 'success';
  if (status === 'returned' || status === 'cancelled') return 'danger';
  if (status === 'ready_for_pickup') return 'warning';
  return 'info';
};

export const getStatusLabel = (status: string, mappings: MappingItem[]) => {
  const normalizedStatus = (status || '').trim().toLowerCase();
  const customLabel = mappings.find(
    (mapping) => mapping.source_status.trim().toLowerCase() === normalizedStatus
  )?.display_status;
  if (customLabel) return customLabel;

  const labels: Record<string, string> = {
    created: 'تم التسجيل',
    order_placed: 'تم استلام الطلب',
    'order placed': 'تم استلام الطلب',
    pending: 'قيد المعالجة',
    confirmed: 'تم التأكيد',
    processing: 'قيد التجهيز لدى شركة التوصيل',
    at_local_hub: 'وصلت إلى مركز الفرز',
    held_at_hub: 'معلّقة لدى شركة التوصيل',
    shipped: 'تم الشحن',
    dispatched: 'غادرت المستودع',
    in_transit: 'في الطريق',
    out_for_delivery: 'خرجت للتوصيل',
    delivered: 'تم التسليم',
    ready_for_pickup: 'جاهزة للاستلام',
    postponed: 'مؤجلة',
    returned: 'مرتجعة',
    cancelled: 'ملغاة',
    attempt_failed_no_answer: 'تعذر الاتصال بالعميل',
    attempt_failed: 'فشلت محاولة التوصيل',
    alerte: 'تحتاج إلى متابعة',
  };
  return labels[normalizedStatus] || normalizedStatus.replace(/_/g, ' ');
};

export const getWhatsAppRecoveryUrl = (order: OrderItem, siteUrl: string, displayStoreName: string) => {
  let phone = (order.customer_phone || '').replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = '213' + phone.substring(1);
  const trackingUrl = `${siteUrl}/t/${order.tracking_uuid}`;

  let msg = '';
  if (order.current_status === 'attempt_failed_no_answer') {
    msg = `⚠️ تنبيه عاجل من ${displayStoreName}!\\nمرحباً ${order.customer_name || ''}، حاول مندوب التوصيل الاتصال بك بخصوص طلبك (${order.external_order_id}) ولم يتم الرد.\\nيرجى فتح الرابط لتأكيد توفرك اليوم لتجنب إرجاع الطلب:\\n${trackingUrl}`;
  } else if (order.current_status === 'ready_for_pickup') {
    msg = `🏢 إشعار استلام من ${displayStoreName}!\\nمرحباً ${order.customer_name || ''}، طردك جاهز للاستلام الآن من مكتب شركة الشحن.\\nتفاصيل الاستلام والتتبع:\\n${trackingUrl}`;
  } else {
    msg = `مرحباً ${order.customer_name || ''}، يمكنك متابعة شحنتك رقم (${order.external_order_id}) لحظة بلحظة عبر الرابط:\\n${trackingUrl}`;
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
};
