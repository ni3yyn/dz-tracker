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
    this.baseUrl = (config.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://dz-tracker-three.vercel.app')).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs || 3500;
    this.debug = !!config.debug;

    if (config.offlineQueue !== false) {
      OfflineQueue.init();
    }
  }

  /**
   * Tracks an order and creates or updates its record in the system
   */
  async trackOrder(params: TrackOrderParams): Promise<TrackOrderResult> {
    if (!params || !params.orderId) {
      throw new Error('[DZTrackerClient.trackOrder]: "orderId" is required.');
    }

    const cleanPhone = normalizeAlgerianPhone(params.phone);

    const payload = {
      order_id: params.orderId,
      customer_name: params.name || null,
      customer_phone: cleanPhone || null,
      status: params.status || 'order_placed',
      product_name: params.productName || null,
      product_image: params.productImage || null,
      carrier_name: params.carrierName || null,
      carrier_tracking_number: params.carrierTrackingNumber || null,
      description: params.description || null,
      total_price: params.totalPrice || null,
      wilaya: params.wilaya || null,
    };

    const url = `${this.baseUrl}/api/webhooks`;

    if (this.debug) {
      console.log('[DZTrackerClient] Sending tracking payload:', payload);
    }

    const result = await OfflineQueue.send(url, this.apiKey, payload, this.timeoutMs);

    if (!result.ok) {
      if (this.debug) {
        console.warn('[DZTrackerClient] Webhook dispatch warning:', result.error);
      }
      // Return optimistic fallback object so checkout never breaks
      const fakeUuid = 'pending_' + Math.random().toString(36).substring(2, 10);
      const fallbackUrl = `${this.baseUrl}/t/${fakeUuid}`;
      return {
        success: false,
        trackingUuid: fakeUuid,
        trackingUrl: fallbackUrl,
        whatsappUrl: this.generateWhatsAppUrl(cleanPhone || '', params.orderId, fallbackUrl, params.name),
        orderId: params.orderId,
      };
    }

    const data = result.data || {};
    const trackingUuid = data.tracking_uuid || data.trackingUuid || '';
    const trackingUrl = data.tracking_url || `${this.baseUrl}/t/${trackingUuid}`;
    const whatsappUrl = this.generateWhatsAppUrl(cleanPhone || '', params.orderId, trackingUrl, params.name);

    return {
      success: true,
      trackingUuid,
      trackingUrl,
      whatsappUrl,
      deduplicated: data.deduplicated || false,
      isNewOrder: data.isNewOrder !== false,
      orderId: params.orderId,
    };
  }

  /**
   * Updates an order's fulfillment or delivery state
   */
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
    if (!result.ok) {
      throw new Error(`[DZTrackerClient Error]: ${result.error?.error || 'Failed to update status'}`);
    }

    return result.data;
  }

  /**
   * Fetches the public tracking timeline for a given tracking UUID
   */
  async getOrder(trackingUuid: string): Promise<OrderTrackingData> {
    if (!trackingUuid) {
      throw new Error('[DZTrackerClient.getOrder]: "trackingUuid" is required.');
    }

    const url = `${this.baseUrl}/api/track/${trackingUuid}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`[DZTrackerClient Error]: Order not found or failed to load (${res.statusText})`);
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Generates a 1-click WhatsApp recovery/notification deep link with prefilled copy
   */
  generateWhatsAppUrl(phone: string, orderId: string, trackingUrl: string, customerName?: string, template?: string): string {
    const cleanPhone = normalizeAlgerianPhone(phone);
    if (!cleanPhone) return '';

    let message = template;
    if (!message) {
      const greeting = customerName ? `مرحباً ${customerName}، ` : 'مرحباً، ';
      message = `${greeting}رابط تتبع شحنتك رقم (${orderId}) لحظة بلحظة:\n${trackingUrl}`;
    }

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  /**
   * Returns the public tracking URL for a given UUID
   */
  getTrackingUrl(trackingUuid: string): string {
    return `${this.baseUrl}/t/${trackingUuid}`;
  }

  /**
   * Returns current config for introspection
   */
  getConfig(): { apiKey: string; baseUrl: string } {
    return {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    };
  }
}
