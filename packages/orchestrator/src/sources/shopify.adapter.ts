import crypto from 'node:crypto';
import { TrackingEvent } from '../index';

export class ShopifyAdapter {
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

  static normalize(merchantId: string, payload: any): TrackingEvent {
    const externalOrderId = payload.name || `#${payload.order_number}` || String(payload.id);

    // تنظيف اسم العميل من الرموز الزائدة
    let customerName = payload.customer
      ? `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim()
      : payload.shipping_address?.name || undefined;
    
    if (customerName) {
      customerName = customerName.replace(/[-_]$/, '').trim();
    }

    const customerPhone =
      payload.customer?.phone ||
      payload.shipping_address?.phone ||
      payload.billing_address?.phone ||
      undefined;
    const firstItem = payload.line_items && payload.line_items.length > 0 ? payload.line_items[0] : null;
    const productName = firstItem?.title || undefined;
    const productImage = firstItem?.image?.src || firstItem?.image_url || undefined;

    // فحص الشحنة وتحديد الحالة والوصف الذكي
    let statusRaw = 'order_placed';
    let carrierName: string | undefined;
    let carrierTrackingNumber: string | undefined;
    let description = 'تم استلام طلبك في المتجر وهو قيد المراجعة';

    const fulfillments = payload.fulfillments || [];
    const latestFulfillment = fulfillments.length > 0 ? fulfillments[fulfillments.length - 1] : null;

    if (latestFulfillment) {
      carrierName = latestFulfillment.tracking_company || latestFulfillment.tracking_carrier || undefined;
      carrierTrackingNumber = latestFulfillment.tracking_number || undefined;

      const shipmentStatus = latestFulfillment.shipment_status;

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
        // 👇 صياغة ذكية: إذا لم يكن هناك بوليصة لا تذكرها أبداً
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
      merchantId,
      externalOrderId,
      customerName,
      customerPhone,
      productName,   // 👈 أضف هذا
      productImage,  // 👈 أضف هذا
      statusRaw,
      description,
      carrierName,
      carrierTrackingNumber,
    };
  }
}