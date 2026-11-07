/**
 * Isomorphic DZ Tracking Client (Server & Client Compatible)
 */
import { DZTrackerConfig, TrackOrderParams, TrackOrderResult, UpdateStatusParams, OrderTrackingData } from './types';
import { normalizeAlgerianPhone } from './utils/phone';
import { OfflineQueue } from './queue';

export class DZTrackerClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private debug: boolean;

  constructor(config: DZTrackerConfig) {
    if (!config || !config.apiKey) {
      throw new Error('[DZTrackerClient]: Missing required "apiKey". Obtain your key from the DZ Tracking Merchant Panel.');
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs || 3500;
    this.debug = !!config.debug;
    // The queue is browser-local only. Node deployments need a durable queue/outbox of their own.
    if (config.offlineQueue !== false) OfflineQueue.init();
  }

  async trackOrder(params: TrackOrderParams): Promise<TrackOrderResult> {
    if (!params || !params.orderId || !String(params.orderId).trim()) {
      throw new Error('[DZTrackerClient.trackOrder]: "orderId" is required.');
    }
    const cleanPhone = normalizeAlgerianPhone(params.phone);
    const payload = {
      order_id: String(params.orderId).trim(),
      customer_name: params.name || null,
      customer_phone: cleanPhone || null,
      status: params.status || 'order_placed',
      product_name: params.productName || null,
      product_image: params.productImage || null,
      carrier_name: params.carrierName || null,
      carrier_tracking_number: params.carrierTrackingNumber || null,
      description: params.description || null,
      // totalPrice and wilaya are retained in the type for compatibility, but the current server schema ignores them.
      telegram_consent: params.telegramConsent === true,
      telegram_consent_source: params.telegramConsent === true ? (params.telegramConsentSource || 'sdk') : null,
    };
    const url = `${this.baseUrl}/api/webhooks`;
    if (this.debug) console.log('[DZTrackerClient] Sending tracking payload:', payload);

    const result = await OfflineQueue.send(url, this.apiKey, payload, this.timeoutMs);
    const data = result.data || {};
    const trackingUuid = data.tracking_uuid || data.trackingUuid || '';
    const trackingUrl = data.tracking_url || (trackingUuid ? `${this.baseUrl}/t/${trackingUuid}` : '');

    if (!result.ok || data.success !== true || !trackingUuid || !trackingUrl) {
      if (this.debug) {
        console.warn('[DZTrackerClient] Tracking registration was not confirmed:', result.error || data.error || 'No tracking UUID returned.');
      }
      const errorValue = result.error || data.error;
      const errorMessage = errorValue instanceof Error
        ? errorValue.message
        : typeof errorValue === 'string'
          ? errorValue
          : errorValue?.message || errorValue?.error || 'Tracking registration was not confirmed by DZ Tracker.';
      return {
        success: false,
        trackingUuid: '',
        trackingUrl: '',
        whatsappUrl: '',
        orderId: String(params.orderId).trim(),
        error: String(errorMessage),
      };
    }

    return {
      success: true,
      trackingUuid,
      trackingUrl,
      whatsappUrl: this.generateWhatsAppUrl(cleanPhone || '', params.orderId, trackingUrl, params.name),
      deduplicated: data.deduplicated === true,
      isNewOrder: data.isNewOrder === true,
      orderId: String(params.orderId).trim(),
    };
  }

  async updateStatus(params: UpdateStatusParams): Promise<any> {
    if (!params.orderId || !params.status) {
      throw new Error('[DZTrackerClient.updateStatus]: "orderId" and "status" are required.');
    }
    const url = `${this.baseUrl}/api/webhooks`;
    const payload = {
      order_id: params.orderId,
      status: params.status,
      description: params.description || null,
      carrier_tracking_number: params.carrierTrackingNumber || null,
    };
    const result = await OfflineQueue.send(url, this.apiKey, payload, this.timeoutMs);
    if (!result.ok || result.data?.success !== true) {
      const errorValue = result.error || result.data?.error;
      const errorMessage = errorValue instanceof Error
        ? errorValue.message
        : errorValue?.message || errorValue?.error || 'Failed to update status';
      throw new Error(`[DZTrackerClient Error]: ${errorMessage}`);
    }
    return result.data;
  }

  async getOrder(trackingUuid: string): Promise<OrderTrackingData> {
    if (!trackingUuid) throw new Error('[DZTrackerClient.getOrder]: "trackingUuid" is required.');
    const url = `${this.baseUrl}/api/track/${encodeURIComponent(trackingUuid)}`;
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`[DZTrackerClient Error]: Order lookup failed (${res.status} ${res.statusText})`);
    const json = await res.json();
    if (json?.success !== true || !json.data) throw new Error('[DZTrackerClient Error]: Invalid tracking response.');
    return json.data as OrderTrackingData;
  }

  generateWhatsAppUrl(phone: string, orderId: string, trackingUrl: string, customerName?: string, template?: string): string {
    const cleanPhone = normalizeAlgerianPhone(phone);
    if (!cleanPhone) return '';
    const message = template || `${customerName ? `مرحباً ${customerName}، ` : 'مرحباً، '}رابط تتبع شحنتك رقم (${orderId}) لحظة بلحظة:\n${trackingUrl}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  getTrackingUrl(trackingUuid: string): string {
    return `${this.baseUrl}/t/${trackingUuid}`;
  }

  /** Do not log this object: it contains the merchant API key. */
  getConfig(): { apiKey: string; baseUrl: string } {
    return { apiKey: this.apiKey, baseUrl: this.baseUrl };
  }
}
