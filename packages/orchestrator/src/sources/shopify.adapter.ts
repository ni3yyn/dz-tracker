import crypto from 'node:crypto';
import { TrackingEvent } from '../index';

export class ShopifyAdapter {
  // التحقق من صحة الـ Webhook عبر HMAC SHA256 (اختياري للأمان المتقدم)
  static verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
    if (!hmacHeader || !secret) return false;
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
    } catch {
      return false;
    }
  }

  // تحويل كائن شوبيفاي إلى صيغة نظامنا الموحدة
  static normalize(merchantId: string, payload: any): TrackingEvent {
    const externalOrderId = payload.name || `#${payload.order_number}` || String(payload.id);

    // استخراج اسم العميل
    const customerName = payload.customer
      ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
      : payload.shipping_address?.name || undefined;

    // استخراج رقم الهاتف
    const customerPhone =
      payload.customer?.phone ||
      payload.shipping_address?.phone ||
      payload.billing_address?.phone ||
      undefined;

    // فحص بيانات الشحن والتوصيل (Fulfillments)
    let statusRaw = 'order_placed';
    let carrierName: string | undefined;
    let carrierTrackingNumber: string | undefined;
    let description = 'تم تسجيل الطلب في المتجر وهو قيد المراجعة';

    const fulfillments = payload.fulfillments || [];
    const latestFulfillment = fulfillments.length > 0 ? fulfillments[fulfillments.length - 1] : null;

    if (latestFulfillment) {
      carrierName = latestFulfillment.tracking_company || latestFulfillment.tracking_carrier;
      carrierTrackingNumber = latestFulfillment.tracking_number;

      const shipmentStatus = latestFulfillment.shipment_status; // شوبيفاي ترسل حالات دقيقة هنا

      if (shipmentStatus) {
        statusRaw = `shopify_${shipmentStatus}`; // مثال: shopify_in_transit, shopify_out_for_delivery, shopify_delivered
        description = shipmentStatus === 'delivered' 
          ? 'تم تسليم الشحنة للعميل بنجاح' 
          : `الشحنة في الطريق مع ${carrierName || 'شركة الشحن'}`;
      } else {
        statusRaw = 'shopify_fulfilled';
        description = `تم تجهيز الشحنة وإصدار بوليصة التتبع: ${carrierTrackingNumber || ''}`;
      }
    } else if (payload.fulfillment_status === 'partial') {
      statusRaw = 'shopify_partially_fulfilled';
      description = 'تم تجهيز جزء من الطلب';
    } else {
      statusRaw = 'shopify_unfulfilled';
    }

    return {
      merchantId,
      externalOrderId,
      customerName,
      customerPhone,
      statusRaw,
      description,
      carrierName,
      carrierTrackingNumber,
    };
  }
}