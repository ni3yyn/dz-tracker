/**
 * Type Definitions for DZ Tracking SDK
 */

export interface DZTrackerConfig {
  /** Merchant API Key obtained from the DZ Tracking Dashboard */
  apiKey: string;
  /** Custom Base URL of the tracking service. Defaults to production or current origin */
  baseUrl?: string;
  /** Automatically intercept forms annotated with data-dz-checkout / data-dz-form (defaults to true) */
  autoCapture?: boolean;
  /** Timeout in milliseconds for tracking requests before failing gracefully (default: 3000ms) */
  timeoutMs?: number;
  /** Enable offline queueing & beacon dispatch when network fluctuates (default: true) */
  offlineQueue?: boolean;
  /** Enable debug logging in the browser console (default: false) */
  debug?: boolean;
}

export interface TrackOrderParams {
  /** Order identifier in your store (e.g. #1092, ORD-5544) */
  orderId: string;
  /** Customer's full name */
  name?: string;
  /** Customer's phone number (Algerian 05/06/07 or international format) */
  phone?: string;
  /** Initial tracking status (default: 'order_placed') */
  status?: string;
  /** Product or item summary (e.g. 'Pack Watch Series 9') */
  productName?: string;
  /** Product thumbnail image URL */
  productImage?: string;
  /** Total order value in DZD */
  totalPrice?: number | string;
  /** Algerian Wilaya name or code */
  wilaya?: string;
  /** Carrier name if already assigned (e.g. 'Yalidine Express', 'NOEST') */
  carrierName?: string;
  /** Waybill / Tracking number if already generated */
  carrierTrackingNumber?: string;
  /** Status description */
  description?: string;
}

export interface TrackOrderResult {
  success: boolean;
  trackingUuid: string;
  trackingUrl: string;
  whatsappUrl: string;
  deduplicated?: boolean;
  isNewOrder?: boolean;
  orderId: string;
}

export interface UpdateStatusParams {
  orderId: string;
  status: string;
  description?: string;
  carrierTrackingNumber?: string;
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
  customerPhone?: string | null;
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

export interface AutoCaptureOptions {
  /** CSS selector for forms to auto-capture (default: 'form[data-dz-checkout], form[data-dz-form]') */
  formSelector?: string;
  /** CSS selector for status action buttons (default: '[data-dz-status], [data-track-status]') */
  actionSelector?: string;
  /** Automatically redirect on successful order creation (default: true) */
  autoRedirect?: boolean;
  /** Callback fired before dispatching order event */
  onBeforeTrack?: (data: TrackOrderParams) => TrackOrderParams | false | Promise<TrackOrderParams | false>;
  /** Callback fired on track success */
  onSuccess?: (result: TrackOrderResult) => void;
  /** Callback fired on track error */
  onError?: (error: Error) => void;
}

export interface DZEventDetail {
  orderId: string;
  status?: string;
  trackingUrl?: string;
  error?: any;
}