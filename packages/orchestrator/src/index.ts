import { getSupabaseAdminClient } from '@saas/database';

// الواجهة الموحدة التي سنحول إليها كل الطلبات بغض النظر عن مصدرها
export interface TrackingEvent {
  merchantId: string;
  externalOrderId: string; // مثل "#1050"
  customerName?: string;
  customerPhone?: string;
  statusRaw: string;       // مثل "wc-processing" أو "shipped"
  description?: string;
  carrierName?: string;
  carrierTrackingNumber?: string;
}

export class TrackingOrchestrator {
  private supabase = getSupabaseAdminClient();

  // الدالة الأساسية التي تستدعى عند وصول أي Webhook
  async processEvent(event: TrackingEvent): Promise<{ success: boolean; trackingUuid?: string; error?: any }> {
    try {
      // 1. جلب الاسم المعروض للحالة بناءً على إعدادات التاجر
      const { data: mapping } = await this.supabase
        .from('status_mappings')
        .select('display_status')
        .eq('merchant_id', event.merchantId)
        .eq('source_status', event.statusRaw)
        .single();

      // إذا لم يقم التاجر بتعيين اسم، نستخدم دالة مساعدة لتجميل النص
      const displayStatus = mapping?.display_status || this.formatFallbackStatus(event.statusRaw);

      // 2. التحقق مما إذا كان الطلب موجوداً مسبقاً في نظامنا
      const { data: existingOrder } = await this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status')
        .eq('merchant_id', event.merchantId)
        .eq('external_order_id', event.externalOrderId)
        .single();

      let orderId: string;
      let trackingUuid: string;

      if (existingOrder) {
        orderId = existingOrder.id;
        trackingUuid = existingOrder.tracking_uuid;

        // تحديث الطلب فقط إذا تغيرت الحالة (لمنع تكرار الإشعارات)
        if (existingOrder.current_status !== event.statusRaw) {
          await this.supabase
            .from('orders')
            .update({
              current_status: event.statusRaw,
              carrier_name: event.carrierName || null,
              carrier_tracking_number: event.carrierTrackingNumber || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId);

          await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description);
        }
      } else {
        // إنشاء طلب جديد
        const { data: newOrder, error: createError } = await this.supabase
          .from('orders')
          .insert({
            merchant_id: event.merchantId,
            external_order_id: event.externalOrderId,
            customer_name: event.customerName || null,
            customer_phone: event.customerPhone || null,
            current_status: event.statusRaw,
            carrier_name: event.carrierName || null,
            carrier_tracking_number: event.carrierTrackingNumber || null,
          })
          .select('id, tracking_uuid')
          .single();

        if (createError || !newOrder) throw createError;
        
        orderId = newOrder.id;
        trackingUuid = newOrder.tracking_uuid;

        await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description);
      }

      return {
        success: true,
        trackingUuid: trackingUuid
      };

    } catch (error: any) {
      console.error('[Orchestrator Error]:', error);
      return { success: false, error: error.message };
    }
  }

  // دالة مساعدة لحفظ السجل الزمني (Timeline)
  private async insertHistory(orderId: string, statusRaw: string, statusTitle: string, description?: string) {
    await this.supabase.from('order_history').insert({
      order_id: orderId,
      status_raw: statusRaw,
      status_title: statusTitle,
      description: description || null,
    });
  }

  // دالة احتياطية لتجميل النصوص الإنجليزية في حال غياب المطابقة: "wc-processing" -> "Processing"
  private formatFallbackStatus(raw: string): string {
    return raw
      .replace(/[-_]/g, ' ')
      .replace('wc ', '') // إزالة بادئة ووكومرس إن وجدت
      .replace(/\b\w/g, char => char.toUpperCase());
  }
}

export { ShopifyAdapter } from './sources/shopify.adapter';
