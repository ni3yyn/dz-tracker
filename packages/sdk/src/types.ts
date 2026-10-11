export interface TrackerClientOptions {
  /** المفتاح السري للتاجر في حال الرغبة بإنشاء أو تحديث طلبات */
  apiKey?: string;
  /** رابط الـ API الأساسي - افتراضياً http://localhost:3000 */
  baseUrl?: string;
}

export interface CarrierInfo {
  name: string | null;
  trackingNumber: string | null;
}

export interface TimelineEvent {
  id: string;
  status: string;
  description: string | null;
  timestamp: string;
}

export interface OrderTrackingData {
  orderId: string;
  customerName: string | null;
  storeName: string;
  currentStatus: string;
  carrier: CarrierInfo;
  createdAt: string;
  timeline: TimelineEvent[];
}

export interface TrackingResponse {
  success: boolean;
  data: OrderTrackingData;
}

export interface CreateOrderPayload {
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  status: string;
  description?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  tracking_url: string;
}