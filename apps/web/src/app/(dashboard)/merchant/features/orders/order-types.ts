export interface OrderItem {
  id: string;
  external_order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  carrier_order_id?: string | null;
  carrier_metadata?: any | null;
  current_status: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  carrier_last_event_at?: string | null;
  tracking_uuid: string;
  created_at: string;
  confirmation_status?: 'pending' | 'confirmed' | 'cancelled' | null;
}

export type OrderStatusFilter = 'all' | 'transit' | 'stopdesk' | 'attention' | 'delivered' | 'returned';
export type OrderSort = 'newest' | 'oldest' | 'risk';
export type ShipmentListFilter = 'all' | 'transit' | 'stopdesk' | 'attention' | 'exceptions' | 'delivered' | 'returned';
