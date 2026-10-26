import { TriggerHandler, TriggerContext, TriggerResult } from './types';

export class OutboundWebhookTrigger implements TriggerHandler {
  name = 'OutboundWebhookNotification';

  canTrigger(ctx: TriggerContext): boolean {
    // Triggers on any state change or new order creation
    return ctx.statusChanged || ctx.isNewOrder;
  }

  async execute(ctx: TriggerContext): Promise<TriggerResult> {
    try {
      const { event, orderId, trackingUuid, siteUrl, merchant, displayStatus } = ctx;

      const payload = {
        event_type: ctx.isNewOrder ? 'order.created' : 'order.status_updated',
        timestamp: new Date().toISOString(),
        merchant_id: merchant.id,
        store_name: merchant.store_name,
        order: {
          id: orderId,
          tracking_uuid: trackingUuid,
          tracking_url: `${siteUrl}/t/${trackingUuid}`,
          external_order_id: event.externalOrderId,
          status_raw: event.statusRaw,
          display_status: displayStatus,
          customer_name: event.customerName || null,
          customer_phone: event.customerPhone || null,
          product_name: event.productName || null,
          carrier_name: event.carrierName || null,
          carrier_tracking_number: event.carrierTrackingNumber || null,
          description: event.description || null,
        },
      };

      return {
        triggerName: this.name,
        channel: 'webhook',
        triggered: true,
        payload,
      };
    } catch (err: any) {
      return {
        triggerName: this.name,
        channel: 'webhook',
        triggered: false,
        error: err?.message || 'Error executing webhook trigger',
      };
    }
  }
}
