import { useEffect, useMemo, useState } from 'react';

type OrderStatusFilter = 'all' | 'transit' | 'stopdesk' | 'attention' | 'delivered' | 'returned';
type OrderSort = 'newest' | 'oldest' | 'risk';

interface FilterableOrder {
  id: string;
  external_order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  current_status: string;
  created_at: string;
}

interface UseOrderFiltersOptions {
  orders: FilterableOrder[];
  exceptionOrderIds: Set<string>;
  activeTab: string;
  isAttentionStatus: (status: string) => boolean;
}

export function useOrderFilters({
  orders,
  exceptionOrderIds,
  activeTab,
  isAttentionStatus,
}: UseOrderFiltersOptions) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [carrierFilter, setCarrierFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<OrderSort>('newest');
  const [visibleOrders, setVisibleOrders] = useState(20);

  const uniqueCarriers = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((order) => {
      if (order.carrier_name) set.add(order.carrier_name);
    });
    return Array.from(set);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders.filter((order) => {
      const matchSearch =
        (order.external_order_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customer_phone || '').includes(searchTerm) ||
        (order.carrier_tracking_number || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (carrierFilter !== 'all' && order.carrier_name !== carrierFilter) {
        return false;
      }

      if (statusFilter === 'attention') {
        return isAttentionStatus(order.current_status);
      }
      if (statusFilter === 'delivered') return order.current_status === 'delivered';
      if (statusFilter === 'returned') return ['returned', 'cancelled'].includes(order.current_status);
      if (statusFilter === 'stopdesk') return order.current_status === 'ready_for_pickup';
      if (statusFilter === 'transit') {
        return ['in_transit', 'out_for_delivery', 'dispatched', 'shipped'].includes(order.current_status);
      }
      return true;
    });

    if (sortBy === 'newest') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'risk') {
      list.sort((a, b) => {
        const aRisk = exceptionOrderIds.has(a.id) ? 1 : 0;
        const bRisk = exceptionOrderIds.has(b.id) ? 1 : 0;
        return bRisk - aRisk;
      });
    }

    return list;
  }, [orders, searchTerm, statusFilter, carrierFilter, sortBy, activeTab, exceptionOrderIds, isAttentionStatus]);

  useEffect(() => {
    setVisibleOrders(20);
  }, [searchTerm, statusFilter, carrierFilter, sortBy, activeTab]);

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    carrierFilter,
    setCarrierFilter,
    sortBy,
    setSortBy,
    uniqueCarriers,
    filteredOrders,
    visibleOrders,
    setVisibleOrders,
  };
}
