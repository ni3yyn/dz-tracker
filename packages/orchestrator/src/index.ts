import { getSupabaseAdminClient } from '@saas/database';

export { ShopifyAdapter } from './sources/shopify.adapter';
export { YalidineAdapter } from './carriers/yalidine.adapter';
export { EcoTrackAdapter } from './carriers/ecotrack.adapter';


export interface TrackingEvent {
  merchantId: string;
  externalOrderId: string;
  customerName?: string;
  customerPhone?: string;
  productName?: string;  // 👈 جديد
  productImage?: string; // 👈 جديد
  statusRaw: string;
  description?: string;
  carrierName?: string;
  carrierTrackingNumber?: string;
}

export class TrackingOrchestrator {
  private get supabase() {
    return getSupabaseAdminClient();
  }

  async processEvent(event: TrackingEvent): Promise<{ success: boolean; trackingUuid?: string; error?: any }> {
    try {
      // 1. جلب الاسم المعروض للحالة بناءً على إعدادات التاجر إن وُجدت
      const { data: mapping } = await this.supabase
        .from('status_mappings')
        .select('display_status')
        .eq('merchant_id', event.merchantId)
        .eq('source_status', event.statusRaw)
        .maybeSingle();

      const displayStatus = mapping?.display_status || this.formatFallbackStatus(event.statusRaw);

      // 2. البحث عن الطلب (إما برقم الطلب الخارجي أو برقم بوليصة شركة الشحن)
      let query = this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status')
        .eq('merchant_id', event.merchantId);

      if (event.externalOrderId && event.externalOrderId !== 'UNKNOWN_ORDER') {
        query = query.eq('external_order_id', event.externalOrderId);
      } else if (event.carrierTrackingNumber) {
        query = query.eq('carrier_tracking_number', event.carrierTrackingNumber);
      }

      const { data: existingOrder } = await query.maybeSingle();

      let orderId: string;
      let trackingUuid: string;

      if (existingOrder) {
        orderId = existingOrder.id;
        trackingUuid = existingOrder.tracking_uuid;

        // تحديث الطلب فقط إذا تغيرت الحالة
        if (existingOrder.current_status !== event.statusRaw) {
          await this.supabase
            .from('orders')
            .update({
              current_status: event.statusRaw,
              carrier_name: event.carrierName || 'Yalidine Express',
              carrier_tracking_number: event.carrierTrackingNumber || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId);

          await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description);
        }
      } else {
        // إنشاء طلب جديد إذا لم يكن موجوداً
        const { data: newOrder, error: createError } = await this.supabase
          .from('orders')
          .insert({
            merchant_id: event.merchantId,
            external_order_id: event.externalOrderId,
            customer_name: event.customerName || null,
            customer_phone: event.customerPhone || null,
            product_name: event.productName || null,   // 👈 تخزين الاسم
            product_image: event.productImage || null, // 👈 تخزين الصورة
            current_status: event.statusRaw,
            carrier_name: event.carrierName || 'Yalidine Express',
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

  private async insertHistory(orderId: string, statusRaw: string, statusTitle: string, description?: string) {
    await this.supabase.from('order_history').insert({
      order_id: orderId,
      status_raw: statusRaw,
      status_title: statusTitle,
      description: description || null,
    });
  }

  // قاموس شامل يدعم شوبيفاي، ووكومرس، وحالات ياليدين التشغيلية الدقيقة
  private formatFallbackStatus(raw: string): string {
    const dictionary: Record<string, string> = {
      order_placed: 'تم تأكيد الطلب 📝',
      processing: 'قيد التجهيز في المستودع 📦',
      dispatched: 'تم تسليم الشحنة لشركة التوصيل 🚚',
      in_transit: 'الشحنة في الطريق إلى ولايتك 🚛',
      at_local_hub: 'وصلت إلى مركز التوزيع المحلي 📍',
      ready_for_pickup: 'جاهز للاستلام من المكتب (Stopdesk) 🏢',
      out_for_delivery: 'خرج للتوصيل مع المندوب اليوم 🛵',
      attempt_failed_no_answer: 'تنبيه: تعذر الاتصال (لا يوجد رد) ⚠️',
      attempt_failed_unreachable: 'تنبيه: الهاتف غير متاح 📵',
      attempt_failed: 'محاولة تسليم غير مكتملة ⚠️',
      postponed: 'تم تأجيل موعد التسليم 🗓️',
      delivered: 'تم التسليم واستلام المبلغ بنجاح ✅',
      returned: 'طرد مرتجع إلى المتجر 🔄',
      cancelled: 'تم إلغاء الطلب ❌',
    };

    const key = raw.toLowerCase().trim();
    if (dictionary[key]) {
      return dictionary[key];
    }

    return raw
      .replace(/shopify_|wc_|yalidine_/gi, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}