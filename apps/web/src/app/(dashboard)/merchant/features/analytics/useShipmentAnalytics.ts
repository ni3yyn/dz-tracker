import { useMemo } from 'react';
import {
  detectShipmentExceptions,
  isShipmentExceptionResolved,
  type ShipmentExceptionOrder,
  type ShipmentExceptionState,
} from '../../shipment-exceptions';

interface AnalyticsOrder extends ShipmentExceptionOrder {
  product_name?: string | null;
}

interface UseShipmentAnalyticsOptions {
  orders: AnalyticsOrder[];
  exceptionStates: ShipmentExceptionState[];
  formatOrderDate: (value: string) => string;
}

export function useShipmentAnalytics({
  orders,
  exceptionStates,
  formatOrderDate,
}: UseShipmentAnalyticsOptions) {
  const deliveredCount = orders.filter((order) => order.current_status === 'delivered').length;
  const inTransitCount = orders.filter((order) =>
    ['in_transit', 'out_for_delivery', 'dispatched', 'shipped'].includes(order.current_status)
  ).length;
  const stopdeskCount = orders.filter((order) => order.current_status === 'ready_for_pickup').length;
  const returnedCount = orders.filter((order) =>
    ['returned', 'cancelled'].includes(order.current_status)
  ).length;

  const detectedShipmentExceptions = useMemo(() => detectShipmentExceptions(orders), [orders]);
  const visibleShipmentExceptions = useMemo(
    () => detectedShipmentExceptions.filter((exception) => !isShipmentExceptionResolved(exception, exceptionStates)),
    [detectedShipmentExceptions, exceptionStates]
  );
  const exceptionCount = visibleShipmentExceptions.length;
  const exceptionOrders = useMemo(() => {
    const uniqueOrders = new Map<string, ShipmentExceptionOrder>();
    for (const exception of visibleShipmentExceptions) uniqueOrders.set(exception.orderId, exception.order);
    return Array.from(uniqueOrders.values());
  }, [visibleShipmentExceptions]);
  const exceptionOrderIds = useMemo(
    () => new Set(visibleShipmentExceptions.map((exception) => exception.orderId)),
    [visibleShipmentExceptions]
  );
  const successRate = orders.length > 0 ? Math.round((deliveredCount / orders.length) * 100) : 0;
  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [orders]
  );

  const lastSevenDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);
      const count = orders.filter((order) => {
        const createdAt = new Date(order.created_at).getTime();
        return createdAt >= day.getTime() && createdAt < nextDay.getTime();
      }).length;
      return { label: day.toLocaleDateString('ar-DZ', { weekday: 'short' }), dateLabel: formatOrderDate(day.toISOString()), count };
    });
  }, [orders, formatOrderDate]);
  const ordersCreatedLastSevenDays = lastSevenDays.reduce((sum, day) => sum + day.count, 0);
  const maxDailyOrders = Math.max(1, ...lastSevenDays.map((day) => day.count));
  const classifiedStatusCount = inTransitCount + stopdeskCount + deliveredCount + returnedCount;
  const statusBreakdown = [
    { key: 'moving', label: 'في الطريق', count: inTransitCount, color: '#638797' },
    { key: 'pickup', label: 'جاهزة للاستلام', count: stopdeskCount, color: '#ac8a4a' },
    { key: 'delivered', label: 'تم التسليم', count: deliveredCount, color: '#5d8968' },
    { key: 'returned', label: 'مرتجعة أو ملغاة', count: returnedCount, color: '#877b85' },
    { key: 'other', label: 'حالات أخرى أو قيد المعالجة', count: Math.max(0, orders.length - classifiedStatusCount), color: '#9a9c91' },
  ];

  return {
    deliveredCount,
    inTransitCount,
    stopdeskCount,
    returnedCount,
    detectedShipmentExceptions,
    visibleShipmentExceptions,
    exceptionCount,
    exceptionOrders,
    exceptionOrderIds,
    successRate,
    recentOrders,
    lastSevenDays,
    ordersCreatedLastSevenDays,
    maxDailyOrders,
    statusBreakdown,
  };
}
