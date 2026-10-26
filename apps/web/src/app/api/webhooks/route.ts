import { createWebhookHandler, handleOptions } from '../../../lib/webhook-handler';

export const dynamic = 'force-dynamic';

export const OPTIONS = handleOptions;

export const POST = createWebhookHandler({
  source: 'direct',
  transformEvent: ({ merchant, payload }) => {
    return {
      merchantId: merchant.id,
      externalOrderId: String(payload.order_id || payload.id || 'DIRECT_ORDER'),
      customerName: payload.customer_name || payload.name,
      customerPhone: payload.customer_phone || payload.phone,
      statusRaw: payload.status || 'order_placed',
      description: payload.description,
      productName: payload.product_name || payload.productName,
      productImage: payload.product_image || payload.productImage,
      carrierName: payload.carrier_name || payload.carrier,
      carrierTrackingNumber: payload.carrier_tracking_number || payload.tracking_number,
    };
  },
});