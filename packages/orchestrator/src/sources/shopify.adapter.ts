import crypto from 'node:crypto';
import { TrackingEvent } from '../index';
import { safeString, normalizeAlgerianPhone } from '../utils/safe';

export class ShopifyAdapter {
  static verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
    if (!hmacHeader || !secret) return false;
    try {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64');
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
    } catch {
      return false;
    }
  }

  static normalize(merchantId: string, rawPayload: any): TrackingEvent {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

    const externalOrderId = safeString(
      payload.name || (payload.order_number ? `#${payload.order_number}` : payload.id) || 'SHOPIFY_ORDER'
    );

    // 1. تنظيف اسم العميل بأمان
    let customerName: string | undefined = undefined;
    if (payload.customer && typeof payload.customer === 'object') {
      const first = safeString(payload.customer.first_name);
      const last = safeString(payload.customer.last_name);
      const full = `${first} ${last}`.trim();
      if (full) customerName = full;
    } else if (payload.shipping_address && typeof payload.shipping_address === 'object') {
      customerName = safeString(payload.shipping_address.name);
    }

    if (customerName) {
      customerName = customerName.replace(/[-_]$/, '').trim();
    }

    // 2. تنظيف هاتف العميل
    const rawPhone =
      payload.customer?.phone ||
      payload.shipping_address?.phone ||
      payload.billing_address?.phone ||
      payload.phone;
    const customerPhone = normalizeAlgerianPhone(rawPhone);

    // 3. استخراج وتلخيص منتجات السلة
    const items = Array.isArray(payload.line_items) ? payload.line_items : [];
    let productName: string | undefined = undefined;

    if (items.length > 0) {
      productName = items
        .map((item: any) => {
          if (!item || typeof item !== 'object') return 'منتج';
          const title = safeString(item.title, 'منتج');
          const qty = Number(item.quantity) || 1;
          return qty > 1 ? `${title} (×${qty})` : title;
        })
        .join(' • ');
    }

    // 4. تحليل بيانات الشحن والتوصيل (Fulfillments)
    let statusRaw = 'order_placed';
    let carrierName: string | undefined;
    let carrierTrackingNumber: string | undefined;
    let description = 'تم استلام طلبك في المتجر وهو قيد المراجعة';

    const fulfillments = Array.isArray(payload.fulfillments) ? payload.fulfillments : [];
    const latestFulfillment = fulfillments.length > 0 ? fulfillments[fulfillments.length - 1] : null;

    if (latestFulfillment && typeof latestFulfillment === 'object') {
      carrierName = safeString(latestFulfillment.tracking_company || latestFulfillment.tracking_carrier) || undefined;
      carrierTrackingNumber = safeString(latestFulfillment.tracking_number) || undefined;

      const shipmentStatus = safeString(latestFulfillment.shipment_status);

      if (shipmentStatus === 'delivered') {
        statusRaw = 'delivered';
        description = 'تم تسليم الشحنة للعميل بنجاح';
      } else if (shipmentStatus === 'out_for_delivery') {
        statusRaw = 'out_for_delivery';
        description = 'الشحنة مع مندوب التوصيل للتسليم اليوم';
      } else if (shipmentStatus === 'in_transit') {
        statusRaw = 'in_transit';
        description = carrierName
          ? `الشحنة في الطريق مع شركة ${carrierName}${carrierTrackingNumber ? ` (رقم التتبع: ${carrierTrackingNumber})` : ''}`
          : 'الشحنة في طريقها إليك مع مندوب التوصيل';
      } else if (payload.fulfillment_status === 'fulfilled') {
        statusRaw = 'fulfilled';
        if (carrierTrackingNumber) {
          description = `تم تجهيز الشحنة وإصدار بوليصة التتبع: ${carrierTrackingNumber}${carrierName ? ` عبر ${carrierName}` : ''}`;
        } else if (carrierName) {
          description = `تم تجهيز طلبك وتسليمه لشركة ${carrierName}`;
        } else {
          description = 'تم تجهيز وتغليف طلبك في المستودع وهو جاهز للشحن';
        }
      }
    } else if (payload.fulfillment_status === 'partial') {
      statusRaw = 'partially_fulfilled';
      description = 'تم تجهيز جزء من الطلب وجاري استكمال الباقي';
    } else {
      statusRaw = 'order_placed';
      description = 'تم استلام طلبك بنجاح وهو قيد المراجعة في المتجر';
    }

    return {
      merchantId: safeString(merchantId),
      externalOrderId,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      productName,
      statusRaw,
      description,
      carrierName,
      carrierTrackingNumber,
    };
  }
}