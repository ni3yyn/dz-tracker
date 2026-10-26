import { getSupabaseAdminClient, Database } from '@saas/database';
import { IdempotencyEngine } from './idempotency';
import { TriggerEngine } from './triggers/trigger-engine';
import { TriggerResult } from './triggers/types';

export { IdempotencyEngine } from './idempotency';
export { ShopifyAdapter } from './sources/shopify.adapter';
export { YalidineAdapter } from './carriers/yalidine.adapter';
export { EcoTrackAdapter } from './carriers/ecotrack.adapter';
export { ZRExpressAdapter, ProcolisAdapter } from './carriers/zrexpress.adapter';
export {
  MaystroAdapter,
  ALGERIA_WILAYAS_58,
  ALGERIA_NEW_WILAYAS_2026,
  resolveCourierWilayaCode,
} from './carriers/maystro.adapter';
export { TriggerEngine } from './triggers/trigger-engine';
export { WhatsAppAlertTrigger } from './triggers/whatsapp.trigger';
export { OutboundWebhookTrigger } from './triggers/webhook.trigger';
export * from './triggers/types';

export interface TrackingEvent {
  merchantId: string;
  externalOrderId: string;
  customerName?: string;
  customerPhone?: string;
  productName?: string;
  productImage?: string;
  statusRaw: string;
  description?: string;
  carrierName?: string;
  carrierTrackingNumber?: string;
}

export interface ProcessEventOptions {
  siteUrl?: string;
  merchantStoreName?: string;
}

export interface ProcessEventResult {
  success: boolean;
  trackingUuid?: string;
  deduplicated?: boolean;
  isNewOrder?: boolean;
  triggers?: TriggerResult[];
  error?: any;
  message?: string;
}

export class TrackingOrchestrator {
  private static inFlightOrderPromises: Map<string, Promise<ProcessEventResult>> = new Map();

  private get supabase() {
    return getSupabaseAdminClient();
  }

  async processEvent(event: TrackingEvent, options?: ProcessEventOptions): Promise<ProcessEventResult> {
    const orderKey = `${event.merchantId}:${event.externalOrderId || event.carrierTrackingNumber || 'unknown'}`;

    // Concurrency boundary: queue concurrent calls for identical order in FIFO sequence
    const prevPromise = TrackingOrchestrator.inFlightOrderPromises.get(orderKey) || Promise.resolve();
    const execute = async (): Promise<ProcessEventResult> => {
      try {
        await prevPromise;
      } catch {
        // Ignore failure of predecessor and continue with current event
      }
      return this.executeProcessEvent(event, options);
    };

    const currentExecution = execute();
    TrackingOrchestrator.inFlightOrderPromises.set(orderKey, currentExecution);

    try {
      const result = await currentExecution;
      return result;
    } finally {
      if (TrackingOrchestrator.inFlightOrderPromises.get(orderKey) === currentExecution) {
        TrackingOrchestrator.inFlightOrderPromises.delete(orderKey);
      }
    }
  }

  private async executeProcessEvent(event: TrackingEvent, options?: ProcessEventOptions): Promise<ProcessEventResult> {
    try {
      // 0. التحقق من ملف التاجر وحالة الحساب
      const { data: merchant } = await this.supabase
        .from('merchants')
        .select('id, store_name, subscription_tier, subscription_status, max_orders_limit, monthly_orders_used, subscription_expires_at')
        .eq('id', event.merchantId)
        .maybeSingle();

      if (!merchant) {
        return { success: false, error: 'merchant_not_found', message: 'لم يتم العثور على المتجر في النظام' };
      }

      if (merchant.subscription_status === 'suspended') {
        return {
          success: false,
          error: 'account_suspended',
          message: 'حساب المتجر موقوف مؤقتاً، يرجى التواصل مع إدارة تاجر تراك.',
        };
      }

      // 1. جلب الاسم المعروض للحالة بناءً على إعدادات التاجر إن وُجدت
      const { data: mapping } = await this.supabase
        .from('status_mappings')
        .select('display_status')
        .eq('merchant_id', event.merchantId)
        .eq('source_status', event.statusRaw)
        .maybeSingle();

      const displayStatus = mapping?.display_status || this.formatFallbackStatus(event.statusRaw);

      // 2. البحث الذكي عن الطلب (Smart Multi-Key Resolution: رقم الطلب -> بوليصة الشحن -> هاتف الزبون)
      const existingOrder = await this.findExistingOrder(event);

      let orderId: string;
      let trackingUuid: string;

      if (existingOrder) {
        orderId = existingOrder.id;
        trackingUuid = existingOrder.tracking_uuid;

        // فحص ما إذا كانت الحالة لم تتغير (Idempotency deduplication)
        const isSameStatus = existingOrder.current_status === event.statusRaw;

        // تحديث البيانات الإضافية إن وُجدت حتى لو كانت الحالة متطابقة
        const updatePayload: Database['public']['Tables']['orders']['Update'] = {
          updated_at: new Date().toISOString(),
        };

        if (!isSameStatus) {
          updatePayload.current_status = event.statusRaw;
        }
        if (event.carrierName) {
          updatePayload.carrier_name = event.carrierName;
        }
        if (event.carrierTrackingNumber && !existingOrder.carrier_tracking_number) {
          updatePayload.carrier_tracking_number = event.carrierTrackingNumber;
        }
        if (event.customerPhone && !existingOrder.customer_phone) {
          updatePayload.customer_phone = event.customerPhone;
        }
        if (event.customerName && !existingOrder.customer_name) {
          updatePayload.customer_name = event.customerName;
        }
        if (event.productName && !existingOrder.product_name) {
          updatePayload.product_name = event.productName;
        }

        await this.supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId);

        // إضافة سجل تاريخي فقط إذا تغيرت الحالة
        if (!isSameStatus) {
          await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description);

          // إطلاق التنبيهات والأحداث الموجهة (Automated Multi-Channel Triggers)
          const triggers = await this.dispatchTriggers({
            event,
            orderId,
            trackingUuid,
            isNewOrder: false,
            statusChanged: true,
            displayStatus,
            options,
          });

          return {
            success: true,
            trackingUuid,
            deduplicated: false,
            isNewOrder: false,
            triggers,
          };
        } else {
          return {
            success: true,
            trackingUuid,
            deduplicated: true,
            isNewOrder: false,
          };
        }
      } else {
        // فحص صلاحية وسقف اشتراك المتجر قبل إنشاء أي طلب جديد
        const isExpired = merchant.subscription_expires_at &&
          new Date(merchant.subscription_expires_at).getTime() < Date.now() &&
          merchant.subscription_tier !== 'starter';

        if (isExpired || merchant.subscription_status === 'expired') {
          if (isExpired && merchant.subscription_status !== 'expired') {
            await this.supabase
              .from('merchants')
              .update({ subscription_status: 'expired' })
              .eq('id', merchant.id);
          }
          return {
            success: false,
            error: 'subscription_expired',
            message: 'انتهت صلاحية اشتراك المتجر. يرجى تجديد الاشتراك لمتابعة تسجيل طلبات جديدة.',
          };
        }

        const currentTier = merchant.subscription_tier || 'starter';
        const tierLimits: Record<string, number> = {
          starter: 30,
          basic: 100,
          growth: 200,
          scale: 999999,
        };
        const defaultTierLimit = tierLimits[currentTier] || 30;
        const orderLimit = currentTier === 'scale'
          ? 999999
          : (merchant.max_orders_limit && merchant.max_orders_limit >= defaultTierLimit
              ? merchant.max_orders_limit
              : defaultTierLimit);
        const currentUsed = merchant.monthly_orders_used ?? 0;

        if (currentTier !== 'scale' && currentUsed >= orderLimit) {
          return {
            success: false,
            error: 'subscription_limit_reached',
            message: `لقد استنفدت الحد الأقصى للطلبات المسموحة في باقتك الحالية (${orderLimit} طلب). يرجى ترقية باقتك للاستمرار في استقبال طلبات جديدة.`,
          };
        }

        // إنشاء طلب جديد إذا لم يكن موجوداً
        const { data: newOrder, error: createError } = await this.supabase
          .from('orders')
          .insert({
            merchant_id: event.merchantId,
            external_order_id: event.externalOrderId,
            customer_name: event.customerName || null,
            customer_phone: event.customerPhone || null,
            product_name: event.productName || null,
            product_image: event.productImage || null,
            current_status: event.statusRaw,
            carrier_name: event.carrierName || 'Yalidine Express',
            carrier_tracking_number: event.carrierTrackingNumber || null,
          })
          .select('id, tracking_uuid')
          .single();

        if (createError) {
          // خطوة إنقاذ ضد Race Conditions في حال إنشاء الطلب في نفس اللحظة عبر مسار موازي
          const retryExisting = await this.findExistingOrder(event);
          if (retryExisting) {
            orderId = retryExisting.id;
            trackingUuid = retryExisting.tracking_uuid;
            const changed = retryExisting.current_status !== event.statusRaw;
            let triggers: TriggerResult[] | undefined = undefined;

            if (changed) {
              await this.supabase
                .from('orders')
                .update({
                  current_status: event.statusRaw,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', orderId);
              await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description);
              triggers = await this.dispatchTriggers({
                event,
                orderId,
                trackingUuid,
                isNewOrder: false,
                statusChanged: true,
                displayStatus,
                options,
              });
            }
            return {
              success: true,
              trackingUuid,
              deduplicated: !changed,
              isNewOrder: false,
              triggers,
            };
          }
          throw createError;
        }

        if (!newOrder) throw new Error('Failed to create order');

        // زيادة استهلاك الطلبات للتاجر بعد تأكيد إنشاء الطلب بنجاح
        await this.supabase
          .from('merchants')
          .update({ monthly_orders_used: currentUsed + 1 })
          .eq('id', merchant.id);

        orderId = newOrder.id;
        trackingUuid = newOrder.tracking_uuid;

        await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description);

        const triggers = await this.dispatchTriggers({
          event,
          orderId,
          trackingUuid,
          isNewOrder: true,
          statusChanged: true,
          displayStatus,
          options,
        });

        return {
          success: true,
          trackingUuid,
          deduplicated: false,
          isNewOrder: true,
          triggers,
        };
      }
    } catch (error: any) {
      console.error('[Orchestrator Error]:', error);
      return { success: false, error: error?.message || 'Unknown orchestrator error' };
    }
  }

  private async dispatchTriggers(params: {
    event: TrackingEvent;
    orderId: string;
    trackingUuid: string;
    isNewOrder: boolean;
    statusChanged: boolean;
    displayStatus: string;
    options?: ProcessEventOptions;
  }): Promise<TriggerResult[]> {
    try {
      let storeName = params.options?.merchantStoreName;
      if (!storeName) {
        const { data: m } = await this.supabase
          .from('merchants')
          .select('store_name')
          .eq('id', params.event.merchantId)
          .maybeSingle();
        storeName = m?.store_name || 'المتجر';
      }

      const siteUrl = params.options?.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

      return await TriggerEngine.evaluateAndDispatch({
        event: params.event,
        orderId: params.orderId,
        trackingUuid: params.trackingUuid,
        isNewOrder: params.isNewOrder,
        statusChanged: params.statusChanged,
        displayStatus: params.displayStatus,
        merchant: {
          id: params.event.merchantId,
          store_name: storeName,
        },
        siteUrl,
      });
    } catch (triggerErr) {
      console.warn('[Orchestrator Trigger Dispatch Warning]:', triggerErr);
      return [];
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

  /**
   * البحث الذكي متعدد المفاتيح عن الطلب (Smart Multi-Key Resolution)
   * 1. رقم الطلب الخارجي (مثال: #1042)
   * 2. رقم بوليصة الشحن (Carrier Tracking Number)
   * 3. رقم هاتف الزبون للشحنات المفتوحة حديثاً في حال نسي التاجر كتابة رقم الطلب
   */
  private async findExistingOrder(event: TrackingEvent) {
    // أ) محاولة المطابقة برقم الطلب الخارجي (مثال: #1042)
    if (event.externalOrderId && event.externalOrderId !== 'UNKNOWN_ORDER') {
      const { data } = await this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status, carrier_tracking_number, customer_phone, customer_name, product_name')
        .eq('merchant_id', event.merchantId)
        .eq('external_order_id', event.externalOrderId)
        .maybeSingle();
      if (data) return data;
    }

    // ب) في حال عدم العثور، محاولة المطابقة برقم بوليصة الشحن (Carrier Tracking Number)
    if (event.carrierTrackingNumber) {
      const { data } = await this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status, carrier_tracking_number, customer_phone, customer_name, product_name')
        .eq('merchant_id', event.merchantId)
        .eq('carrier_tracking_number', event.carrierTrackingNumber)
        .maybeSingle();
      if (data) return data;
    }

    // ج) حزام أمان ذكي: المطابقة برقم هاتف الزبون للشحنات المفتوحة حديثاً في حال نسي التاجر كتابة رقم الطلب
    if (event.customerPhone) {
      const { data } = await this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status, carrier_tracking_number, customer_phone, customer_name, product_name')
        .eq('merchant_id', event.merchantId)
        .eq('customer_phone', event.customerPhone)
        .is('carrier_tracking_number', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }

    return null;
  }

  // قاموس شامل يدعم شوبيفاي، ووكومرس، وحالات ياليدين وإيكوتراك التشغيلية الدقيقة
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

    const key = (raw || '').toLowerCase().trim();
    if (dictionary[key]) {
      return dictionary[key];
    }

    return (raw || '')
      .replace(/shopify_|wc_|yalidine_|ecotrack_/gi, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}