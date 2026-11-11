export type ShipmentExceptionType =
  | 'delivery_failed' | 'delivery_postponed' | 'no_first_scan'
  | 'out_for_delivery_stalled' | 'shipment_stalled' | 'pickup_waiting'
  | 'returning' | 'returned';
export type ShipmentExceptionSeverity = 'critical' | 'warning';
export type ShipmentExceptionStateValue = 'open' | 'acknowledged' | 'snoozed' | 'resolved';

export interface ShipmentExceptionOrder {
  id: string;
  external_order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  current_status: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  tracking_uuid: string;
  created_at: string;
  carrier_last_event_at?: string | null;
}
export interface ShipmentExceptionState {
  order_id: string;
  exception_type: string;
  state: ShipmentExceptionStateValue;
  event_fingerprint: string;
  snoozed_until: string | null;
  updated_at?: string;
}
export interface ShipmentException {
  id: string;
  orderId: string;
  type: ShipmentExceptionType;
  severity: ShipmentExceptionSeverity;
  title: string;
  description: string;
  detectedAt: string;
  lastEventAt: string | null;
  eventFingerprint: string;
  order: ShipmentExceptionOrder;
}

const HOUR = 60 * 60 * 1000;
function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function createException(
  order: ShipmentExceptionOrder,
  type: ShipmentExceptionType,
  severity: ShipmentExceptionSeverity,
  title: string,
  description: string,
  lastEventAt: string | null
): ShipmentException {
  const eventFingerprint = [
    (order.current_status || '').trim().toLowerCase(),
    lastEventAt || order.created_at,
    order.carrier_name || '',
    order.carrier_tracking_number || '',
  ].join('|');
  return {
    id: order.id + ':' + type,
    orderId: order.id,
    type,
    severity,
    title,
    description,
    detectedAt: new Date().toISOString(),
    lastEventAt,
    eventFingerprint,
    order,
  };
}

/**
 * Uses only the courier's current status and its last actual event timestamp.
 * Order updated_at is deliberately excluded because metadata syncs also update it.
 */
export function detectShipmentExceptions(
  orders: ShipmentExceptionOrder[],
  now = Date.now()
): ShipmentException[] {
  const result: ShipmentException[] = [];

  for (const order of orders) {
    const status = (order.current_status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const lastEventAt = order.carrier_last_event_at || null;
    const eventTime = parseTime(lastEventAt);
    const elapsed = eventTime === null ? null : Math.max(0, now - eventTime);

    if (
      status.includes('attempt_failed') || status === 'alerte' ||
      status === 'delivery_failed' || status === 'failed_delivery'
    ) {
      result.push(createException(order, 'delivery_failed', 'critical',
        'فشلت محاولة التوصيل',
        'سجّلت شركة الشحن تعذّر التسليم. تواصل مع الزبون سريعاً وتحقق من إمكانية إعادة المحاولة.',
        lastEventAt));
      continue;
    }
    if (status === 'postponed' || status === 'delivery_postponed') {
      result.push(createException(order, 'delivery_postponed', 'warning',
        'تم تأجيل التوصيل',
        'الشحنة مؤجلة حسب آخر حالة مؤكدة. تحقق من السبب وتواصل مع الزبون بشأن المحاولة التالية.',
        lastEventAt));
      continue;
    }
    if (['returning','return_in_progress','return_to_sender','returned_to_sender','en_retour','retour_en_cours'].includes(status)) {
      result.push(createException(order, 'returning', 'critical',
        'الشحنة في طريق الإرجاع',
        'تشير آخر حالة مؤكدة إلى بدء الإرجاع. تابع مع شركة الشحن قبل إغلاق العملية.',
        lastEventAt));
      continue;
    }
    if (['returned','retourne','retournee','retournée'].includes(status)) {
      result.push(createException(order, 'returned', 'warning',
        'تم إرجاع الشحنة',
        'أكدت شركة الشحن أن الشحنة مرتجعة. راجع سبب الإرجاع والتكلفة قبل اتخاذ قرار إعادة الإرسال.',
        lastEventAt));
      continue;
    }

    // Without an actual carrier timestamp there is no safe basis for a stalled alert.
    if (elapsed === null) continue;

    if (
      ['created','label_created'].includes(status) &&
      Boolean(order.carrier_name && order.carrier_tracking_number) &&
      elapsed >= 48 * HOUR
    ) {
      result.push(createException(order, 'no_first_scan', 'warning',
        'لم تُسجّل أول حركة للشحنة',
        'مرّت 48 ساعة أو أكثر منذ آخر حالة مؤكدة وما زالت الشحنة في مرحلة التسجيل. تحقق من تسليم الطرد فعلياً إلى شركة التوصيل.',
        lastEventAt));
      continue;
    }
    if (status === 'out_for_delivery' && elapsed >= 24 * HOUR) {
      result.push(createException(order, 'out_for_delivery_stalled', 'critical',
        'خرجت للتوصيل دون تحديث جديد',
        'لم يصل تحديث من شركة الشحن منذ 24 ساعة أو أكثر بعد خروج الشحنة للتوصيل. تابع مع المندوب أو مركز التوزيع.',
        lastEventAt));
      continue;
    }
    if (status === 'ready_for_pickup' && elapsed >= 72 * HOUR) {
      result.push(createException(order, 'pickup_waiting', 'warning',
        'الشحنة تنتظر الاستلام من المكتب',
        'الشحنة جاهزة للاستلام منذ 72 ساعة أو أكثر. ذكّر الزبون وتحقق من مدة الاحتفاظ لدى شركة التوصيل.',
        lastEventAt));
      continue;
    }
    if (['in_transit','dispatched','shipped'].includes(status) && elapsed >= 72 * HOUR) {
      result.push(createException(order, 'shipment_stalled', 'warning',
        'توقفت تحديثات الشحنة',
        'لم يصل تحديث مؤكد من شركة الشحن منذ 72 ساعة أو أكثر. اطلب التحقق من موقع الطرد.',
        lastEventAt));
    }
  }

  const priority: Record<ShipmentExceptionSeverity, number> = { critical: 0, warning: 1 };
  return result.sort((a, b) => {
    const diff = priority[a.severity] - priority[b.severity];
    return diff || ((parseTime(a.lastEventAt) ?? 0) - (parseTime(b.lastEventAt) ?? 0));
  });
}

export function shipmentExceptionStateKey(orderId: string, type: string): string {
  return orderId + ':' + type;
}
export function isShipmentExceptionResolved(
  exception: ShipmentException,
  states: ShipmentExceptionState[]
): boolean {
  const state = states.find((item) =>
    item.order_id === exception.orderId && item.exception_type === exception.type
  );
  return Boolean(state && state.state === 'resolved' &&
    state.event_fingerprint === exception.eventFingerprint);
}
