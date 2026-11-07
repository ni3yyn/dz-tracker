/**
 * Type Definitions for DZ Tracking SDK
 */
export interface DZTrackerConfig {
  /** Merchant API key obtained from the dashboard. Keep it server-side. */
  apiKey: string;
  /** Custom base URL; defaults to browser origin or production on Node.js. */
  baseUrl?: string;
  /** Enable browser auto-capture (default: true). */
  autoCapture?: boolean;
  /** Request timeout in milliseconds (default: 3500ms). */
  timeoutMs?: number;
  /** Best-effort browser localStorage queue (default: true; no server-side persistence). */
  offlineQueue?: boolean;
  /** Enable debug logging. Never log or expose the API key. */
  debug?: boolean;
}

export interface TrackOrderParams {
  /** Stable external order identifier from the merchant's store (required). */
  orderId: string;
  name?: string;
  /** Algerian local/international phone format. */
  phone?: string;
  /** Initial raw status (default: order_placed). */
  status?: string;
  productName?: string;
  productImage?: string;
  /** @deprecated Accepted for compatibility; current server/database do not persist it. */
  totalPrice?: number | string;
  /** @deprecated Accepted for compatibility; current server/database do not persist it. */
  wilaya?: string;
  carrierName?: string;
  carrierTrackingNumber?: string;
  description?: string;
  /** True only when the customer explicitly consented to Telegram communication. */
  telegramConsent?: boolean;
  telegramConsentSource?: string;
}

export interface TrackOrderResult {
  success: boolean;
  trackingUuid: string;
  trackingUrl: string;
  whatsappUrl: string;
  deduplicated?: boolean;
  isNewOrder?: boolean;
  orderId: string;
  /** Present when API-confirmed tracking registration failed. */
  error?: string;
}

export interface UpdateStatusParams {
  /** Use the same stable external ID used for registration. */
  orderId: string;
  status: string;
  description?: string;
  carrierTrackingNumber?: string;
}

export interface CarrierInfo { name: string | null; trackingNumber: string | null; }
export interface TimelineEvent { id: string; status: string; description: string | null; timestamp: string; }
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
export interface TrackingResponse { success: boolean; data: OrderTrackingData; }

export interface AutoCaptureOptions {
  formSelector?: string;
  actionSelector?: string;
  /** Navigation is opt-in: by default a form must set data-dz-redirect. */
  autoRedirect?: boolean;
  onBeforeTrack?: (data: TrackOrderParams) => TrackOrderParams | false | Promise<TrackOrderParams | false>;
  onSuccess?: (result: TrackOrderResult) => void;
  onError?: (error: Error) => void;
}
export interface DZEventDetail { orderId: string; status?: string; trackingUrl?: string; error?: unknown; }
