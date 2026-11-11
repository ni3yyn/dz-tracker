import { getSupabaseAdminClient, Database } from '@saas/database';
import { IdempotencyEngine } from './idempotency';
import { TriggerEngine } from './triggers/trigger-engine';
import { TriggerResult } from './triggers/types';

export { IdempotencyEngine } from './idempotency';
export { ShopifyAdapter } from './sources/shopify.adapter';
export { YalidineAdapter } from './carriers/yalidine.adapter';
export { EcoTrackAdapter } from './carriers/ecotrack.adapter';
export { ZRExpressAdapter, ProcolisAdapter } from './carriers/zrexpress.adapter';
export { ZRExpressWebhookAdapter, ZR_EXPRESS_WEBHOOK_EVENT_TYPES, verifyZRExpressWebhook, isZRExpressWebhookEvent } from './carriers/zrexpress-webhook.adapter';
export type { ZRExpressWebhookEvent, ZRExpressWebhookEventType } from './carriers/zrexpress-webhook.adapter';
export { ZimouAdapter, mapZimouStatus } from './carriers/zimou.adapter';
export { ElogistiaAdapter, mapElogistiaStatus, parseElogistiaDate } from './carriers/elogistia.adapter';
export { EcomV2Adapter, mapEcomV2Status, parseEcomV2Date, ecomV2EventId } from './carriers/ecom-v2.adapter';
export {
  MaystroAdapter,
  ALGERIA_WILAYAS_58,
  ALGERIA_NEW_WILAYAS_2026,
  resolveCourierWilayaCode,
  parseMaystroWebhookEnvelope,
  mapMaystroStatus,
} from './carriers/maystro.adapter';
export type { MaystroWebhookEnvelope } from './carriers/maystro.adapter';
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
  /** Arabic provider-specific timeline title; keeps canonical statusRaw unchanged. */
  statusTitle?: string;
  description?: string;
  carrierName?: string;
  carrierTrackingNumber?: string;
  /** Provider-side order UUID, distinct from its customer-facing tracking number. */
  carrierOrderId?: string;
  /** Actual carrier-provided external/store order reference when present. */
  carrierExternalOrderId?: string;
  /** Selected provider order fields retained for merchant-side auditing/display. */
  carrierMetadata?: Record<string, unknown>;
  /** Distinguishes provider-specific event ledgers when a webhook has no signature ID. */
  sourceProvider?: 'procolis' | 'zrexpress' | 'maystro' | 'zimou' | 'elogistia' | 'ecom_v2' | 'yalidine' | 'guepex';
  /** Import a historical provider event without firing customer notifications. */
  suppressTriggers?: boolean;
  /** Provider event time used to reject out-of-order courier status events. */
  sourceOccurredAt?: string;
  sourceEventType?: string;
  /** Stable provider event key persisted for replay/idempotency protection. */
  sourceEventId?: string;
}

export interface ProcessEventOptions {
  siteUrl?: string;
  merchantStoreName?: string;
}

export interface ProcessEventResult {
  success: boolean;
  trackingUuid?: string;
  orderId?: string;
  deduplicated?: boolean;
  isNewOrder?: boolean;
  triggers?: TriggerResult[];
  error?: any;
  message?: string;
}


async function recordOrderedCarrierStatus(
  supabase: any,
  event: TrackingEvent,
  orderId: string,
  displayStatus: string
) {
  if (event.sourceProvider === 'maystro') {
    return supabase.rpc('record_carrier_order_status_change', {
      p_order_id: orderId,
      p_merchant_id: event.merchantId,
      p_provider: 'maystro',
      p_event_id: event.sourceEventId,
      p_status_raw: event.statusRaw,
      p_status_title: displayStatus,
      p_description: event.description || null,
      p_occurred_at: event.sourceOccurredAt,
    });
  }

  return supabase.rpc('record_order_status_change_ordered', {
    p_order_id: orderId,
    p_status_raw: event.statusRaw,
    p_status_title: displayStatus,
    p_description: event.description || null,
    p_occurred_at: event.sourceOccurredAt,
    p_source_event_id: event.sourceEventId || null,
  });
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

  private async executeProcessEvent(event: TrackingEvent, options?: ProcessEventOptions, recoveryAttempt = 0): Promise<ProcessEventResult> {
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

      const displayStatus = event.statusTitle || mapping?.display_status || this.formatFallbackStatus(event.statusRaw);

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

        if (!isSameStatus && !event.sourceOccurredAt) {
          updatePayload.current_status = event.statusRaw;
        }
        if (event.carrierName) {
          updatePayload.carrier_name = event.carrierName;
        }
        if (event.sourceProvider === 'maystro' || event.sourceProvider === 'zimou' || event.sourceProvider === 'elogistia' || event.sourceProvider === 'ecom_v2' || event.sourceProvider === 'yalidine' || event.sourceProvider === 'guepex' || event.sourceProvider === 'procolis') {
          // Carrier API snapshots refresh authoritative provider metadata and recipient fields.
          // refresh the snapshot from the authenticated API instead of retaining stale values.
          if (event.carrierTrackingNumber) updatePayload.carrier_tracking_number = event.carrierTrackingNumber;
          if (event.carrierOrderId) updatePayload.carrier_order_id = event.carrierOrderId;
          if (event.carrierExternalOrderId) updatePayload.external_order_id = event.carrierExternalOrderId;
          if (event.carrierMetadata) {
            if (event.sourceProvider === 'zimou' || event.sourceProvider === 'elogistia' || event.sourceProvider === 'ecom_v2' || event.sourceProvider === 'yalidine' || event.sourceProvider === 'guepex' || event.sourceProvider === 'procolis') {
              const incoming = Object.fromEntries(Object.entries(event.carrierMetadata).filter(([, value]) => value !== null && value !== undefined && value !== ''));
              updatePayload.carrier_metadata = { ...((existingOrder.carrier_metadata as Record<string, unknown> | null) || {}), ...incoming } as any;
            } else {
              updatePayload.carrier_metadata = event.carrierMetadata as any;
            }
          }
          if (event.productImage) updatePayload.product_image = event.productImage;
          if (event.customerPhone) updatePayload.customer_phone = event.customerPhone;
          if (event.customerName) updatePayload.customer_name = event.customerName;
          if (event.productName) updatePayload.product_name = event.productName;
        } else {
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
        }

        await this.supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId);

        // ZR Express deliveries may arrive out of order. The database RPC locks the
        // order, rejects stale provider timestamps, and records every verified
        // state/situation/return event (including same-category situations).
        if (event.sourceOccurredAt) {
          const { data: orderedResult, error: orderedError } = await recordOrderedCarrierStatus(
            this.supabase,
            event,
            orderId,
            displayStatus
          );
          if (orderedError) throw orderedError;
          const actuallyChanged = orderedResult?.[0]?.changed === true;
          if (!actuallyChanged) {
            return { success: true, trackingUuid, deduplicated: true, isNewOrder: false };
          }
          const triggers = event.suppressTriggers ? [] : await this.dispatchTriggers({
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
        }

        // إضافة سجل تاريخي فقط إذا تغيرت الحالة ذرّياً عبر RPC
        if (!isSameStatus) {
          const { data: statusChangeData } = await this.supabase.rpc('record_order_status_change', {
            p_order_id: orderId,
            p_status_raw: event.statusRaw,
            p_status_title: displayStatus,
            p_description: event.description || null,
          });

          const actuallyChanged = statusChangeData?.[0]?.changed ?? true;

          if (actuallyChanged) {
            // Historical carrier snapshots must not replay customer notifications.
            const triggers = event.suppressTriggers ? [] : await this.dispatchTriggers({
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
        } else if (event.statusTitle) {
          // EcoTrack may advance through multiple official sub-states while its
          // normalized TajerTrack category remains the same (e.g. vers_hub -> vers_wilaya).
          // Preserve each distinct Arabic stage in the customer timeline.
          const { data: latestHistory, error: historyReadError } = await this.supabase
            .from('order_history')
            .select('status_title')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (historyReadError) throw historyReadError;

          if (latestHistory?.status_title !== displayStatus) {
            const { error: historyInsertError } = await this.supabase
              .from('order_history')
              .insert({
                order_id: orderId,
                status_raw: event.statusRaw,
                status_title: displayStatus,
                description: event.description || null,
                event_type: 'status_changed',
              });

            if (historyInsertError) throw historyInsertError;

            // Do not notify customers just because an old generic title was
            // upgraded to its Arabic EcoTrack-specific equivalent. Subsequent
            // real EcoTrack sub-state changes still pass through normal triggers.
            const isInitialTitleBackfill = !latestHistory ||
              latestHistory.status_title === this.formatFallbackStatus(event.statusRaw);
            const triggers = isInitialTitleBackfill
              ? []
              : await this.dispatchTriggers({
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
          }

          return {
            success: true,
            trackingUuid,
            deduplicated: true,
            isNewOrder: false,
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
        // Database transaction locks the merchant row, reconciles the real
        // rolling/billing-period usage, checks the limit, creates the order,
        // and increments the counter atomically.
        const { data: quotaReservation, error: quotaError } = await this.supabase.rpc(
          'create_tracked_order_with_quota',
          {
            p_merchant_id: event.merchantId,
            p_external_order_id: event.externalOrderId,
            p_customer_name: event.customerName || null,
            p_customer_phone: event.customerPhone || null,
            p_product_name: event.productName || null,
            p_product_image: event.productImage || null,
            p_current_status: event.statusRaw,
            p_carrier_last_event_at: event.sourceOccurredAt || null,
            p_carrier_name: event.carrierName || null,
            p_carrier_tracking_number: event.carrierTrackingNumber || null,
            p_carrier_order_id: (
              event.sourceProvider === 'maystro' ||
              event.sourceProvider === 'zimou' ||
              event.sourceProvider === 'elogistia' ||
              event.sourceProvider === 'ecom_v2' ||
              event.sourceProvider === 'yalidine' ||
              event.sourceProvider === 'guepex' ||
              event.sourceProvider === 'procolis'
            ) ? event.carrierOrderId || null : null,
            p_carrier_metadata: (
              event.sourceProvider === 'maystro' ||
              event.sourceProvider === 'zimou' ||
              event.sourceProvider === 'elogistia' ||
              event.sourceProvider === 'ecom_v2' ||
              event.sourceProvider === 'yalidine' ||
              event.sourceProvider === 'guepex' ||
              event.sourceProvider === 'procolis'
            ) ? (event.carrierMetadata as any) || null : null,
            p_source_provider: event.sourceProvider || null,
          }
        );

        const quotaFunctionMissing = Boolean(
          quotaError && (
            quotaError.code === 'PGRST202' ||
            quotaError.code === '42883' ||
            /could not find the function|function .* does not exist/i.test(quotaError.message || '')
          )
        );

        if (quotaFunctionMissing) {
          // Safe rollout compatibility: the old order flow remains available
          // until the accompanying SQL migration has been applied. This path
          // is intentionally temporary; the atomic RPC takes over immediately
          // once PostgREST can resolve the new function.
          console.warn('[Quota]: Atomic quota RPC is not installed yet; using legacy quota handling until the SQL migration is applied.');

          const legacyTier = merchant.subscription_tier || 'starter';
          const legacyExpired = Boolean(
            merchant.subscription_expires_at &&
            new Date(merchant.subscription_expires_at).getTime() < Date.now() &&
            legacyTier !== 'starter'
          );
          if (legacyExpired || merchant.subscription_status === 'expired') {
            if (legacyExpired && merchant.subscription_status !== 'expired') {
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

          const legacyLimits: Record<string, number> = {
            starter: 30,
            basic: 100,
            growth: 200,
            scale: 999999,
          };
          const legacyDefaultLimit = legacyLimits[legacyTier] || 30;
          const legacyLimit = legacyTier === 'scale'
            ? 999999
            : (merchant.max_orders_limit && merchant.max_orders_limit >= legacyDefaultLimit
                ? merchant.max_orders_limit
                : legacyDefaultLimit);
          const legacyUsed = merchant.monthly_orders_used ?? 0;

          if (legacyTier !== 'scale' && legacyUsed >= legacyLimit) {
            return {
              success: false,
              error: 'subscription_limit_reached',
              message: `لقد استنفدت الحد الأقصى للطلبات المسموحة في باقتك الحالية (${legacyLimit} طلب). يرجى ترقية باقتك للاستمرار في استقبال طلبات جديدة.`,
            };
          }

          const { data: legacyOrder, error: legacyCreateError } = await (this.supabase as any)
            .from('orders')
            .insert({
              merchant_id: event.merchantId,
              external_order_id: event.externalOrderId,
              customer_name: event.customerName || null,
              customer_phone: event.customerPhone || null,
              product_name: event.productName || null,
              product_image: event.productImage || null,
              current_status: event.statusRaw,
              carrier_last_event_at: event.sourceOccurredAt || null,
              carrier_name: event.carrierName || 'Yalidine Express',
              carrier_tracking_number: event.carrierTrackingNumber || null,
              ...(([
                'maystro', 'zimou', 'elogistia', 'ecom_v2', 'yalidine', 'guepex', 'procolis',
              ] as string[]).includes(event.sourceProvider || '') ? {
                carrier_order_id: event.carrierOrderId || null,
                carrier_metadata: event.carrierMetadata || null,
              } : {}),
            })
            .select('id, tracking_uuid')
            .single();

          if (legacyCreateError || !legacyOrder) {
            const racedOrder = await this.findExistingOrder(event);
            if (racedOrder && recoveryAttempt < 1) {
              return this.executeProcessEvent(event, options, recoveryAttempt + 1);
            }
            throw legacyCreateError || new Error('Legacy order creation returned no order.');
          }

          const { error: legacyLedgerError } = await (this.supabase as any)
            .from('merchant_order_usage_events')
            .insert({
              merchant_id: merchant.id,
              order_id: legacyOrder.id,
              external_order_id: event.externalOrderId,
              source_provider: event.sourceProvider || null,
              created_at: new Date().toISOString(),
            });
          if (legacyLedgerError && !['PGRST205', '42P01'].includes(legacyLedgerError.code || '')) {
            console.warn('[Quota]: Legacy fallback could not persist its usage event:', legacyLedgerError.message);
          }

          const { error: legacyUsageError } = await this.supabase
            .from('merchants')
            .update({ monthly_orders_used: legacyUsed + 1 })
            .eq('id', merchant.id);
          if (legacyUsageError) throw legacyUsageError;

          orderId = legacyOrder.id;
          trackingUuid = legacyOrder.tracking_uuid;
        } else if (quotaError) {
          // A conflicting insert from an older/parallel application instance
          // may still win the race. Recover through the normal existing-order
          // path; otherwise preserve the database error for observability.
          const racedOrder = await this.findExistingOrder(event);
          if (racedOrder && recoveryAttempt < 1) {
            return this.executeProcessEvent(event, options, recoveryAttempt + 1);
          }
          throw quotaError;
        } else {
        const reservation = quotaReservation as any;
        if (!reservation || typeof reservation.outcome !== 'string') {
          throw new Error('Quota reservation returned an invalid response.');
        }

        if (reservation.outcome === 'existing') {
          // Another request created this same order while this request waited
          // on the merchant lock. Re-run once so its new status is applied by
          // the established existing-order update path.
          if (recoveryAttempt < 1) {
            return this.executeProcessEvent(event, options, recoveryAttempt + 1);
          }
          return {
            success: false,
            error: 'order_race_recovery_failed',
            message: 'تعذر استكمال تحديث الطلب المتزامن. أعد إرسال الحدث.',
          };
        }

        if (reservation.outcome === 'merchant_not_found') {
          return { success: false, error: 'merchant_not_found', message: 'لم يتم العثور على المتجر في النظام' };
        }

        if (reservation.outcome === 'account_suspended') {
          return {
            success: false,
            error: 'account_suspended',
            message: 'حساب المتجر موقوف مؤقتاً، يرجى التواصل مع إدارة تاجر تراك.',
          };
        }

        if (reservation.outcome === 'subscription_expired') {
          return {
            success: false,
            error: 'subscription_expired',
            message: 'انتهت صلاحية اشتراك المتجر. يرجى تجديد الاشتراك لمتابعة تسجيل طلبات جديدة.',
          };
        }

        if (reservation.outcome === 'subscription_limit_reached') {
          return {
            success: false,
            error: 'subscription_limit_reached',
            message: `لقد استنفدت الحد الأقصى للطلبات المسموحة في باقتك الحالية (${reservation.order_limit} طلب). يرجى ترقية باقتك للاستمرار في استقبال طلبات جديدة.`,
          };
        }

        if (reservation.outcome === 'invalid_order_identity') {
          return {
            success: false,
            error: 'invalid_order_identity',
            message: 'يجب إرسال رقم طلب خارجي أو رقم تتبع ثابت قبل تسجيل الطلب.',
          };
        }

        if (reservation.outcome !== 'created' || !reservation.order_id || !reservation.tracking_uuid) {
          throw new Error(`Unexpected quota reservation outcome: ${reservation.outcome}`);
        }

        orderId = reservation.order_id;
        trackingUuid = reservation.tracking_uuid;
        }

        // Explicitly classify initial history as order_created (bypasses push notification fanout)
        await this.insertHistory(orderId, event.statusRaw, displayStatus, event.description, 'order_created', event.sourceOccurredAt, Boolean(event.sourceEventId));
        if (event.sourceEventId && event.sourceOccurredAt) {
          const isMaystro = event.sourceProvider === 'maystro';
          const { error: appliedEventError } = await (this.supabase as any)
            .from(isMaystro ? 'carrier_order_applied_events' : 'zrexpress_webhook_applied_events')
            .insert(isMaystro
              ? {
                  merchant_id: event.merchantId,
                  provider: 'maystro',
                  event_id: event.sourceEventId,
                  order_id: orderId,
                  occurred_at: event.sourceOccurredAt,
                }
              : {
                  merchant_id: event.merchantId,
                  svix_id: event.sourceEventId,
                  order_id: orderId,
                  occurred_at: event.sourceOccurredAt,
                });
          if (appliedEventError && appliedEventError.code !== '23505') throw appliedEventError;
        }

        const triggers = event.suppressTriggers ? [] : await this.dispatchTriggers({
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
          orderId,
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

  private async insertHistory(
    orderId: string,
    statusRaw: string,
    statusTitle: string,
    description?: string,
    eventType: 'order_created' | 'status_changed' = 'status_changed',
    createdAt?: string,
    throwOnError = false
  ) {
    const { error } = await this.supabase.from('order_history').insert({
      order_id: orderId,
      status_raw: statusRaw,
      status_title: statusTitle,
      description: description || null,
      event_type: eventType,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
    if (throwOnError && error) throw error;
  }

  /**
   * البحث الذكي متعدد المفاتيح عن الطلب (Smart Multi-Key Resolution)
   * 1. رقم الطلب الخارجي (مثال: #1042)
   * 2. رقم بوليصة الشحن (Carrier Tracking Number)
   * 3. رقم هاتف الزبون للشحنات المفتوحة حديثاً في حال نسي التاجر كتابة رقم الطلب
   */
  private async findExistingOrder(event: TrackingEvent) {
    // Provider internal IDs are more stable than display/tracking numbers.
    if (event.carrierOrderId && event.carrierName) {
      const { data } = await this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status, carrier_name, carrier_tracking_number, customer_phone, customer_name, product_name, carrier_metadata')
        .eq('merchant_id', event.merchantId)
        .eq('carrier_name', event.carrierName)
        .eq('carrier_order_id', event.carrierOrderId)
        .maybeSingle();
      if (data) return data;
    }

    // Match an external store order only when it is not already assigned to
    // a different courier. This lets first-time courier events attach to an
    // existing store order without allowing Procolis to take over a ZR order.
    if (
      event.externalOrderId &&
      event.externalOrderId !== 'UNKNOWN_ORDER' &&
      !(
        (event.sourceProvider === 'yalidine' || event.sourceProvider === 'guepex') &&
        event.externalOrderId === event.carrierTrackingNumber
      )
    ) {
      const { data } = await this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status, carrier_name, carrier_tracking_number, customer_phone, customer_name, product_name, carrier_metadata')
        .eq('merchant_id', event.merchantId)
        .eq('external_order_id', event.externalOrderId)
        .maybeSingle();
      if (data && (!event.carrierName || !data.carrier_name || data.carrier_name === event.carrierName)) {
        return data;
      }
    }

    // Tracking numbers are only unique inside a courier's own namespace.
    if (event.carrierTrackingNumber) {
      let query = this.supabase
        .from('orders')
        .select('id, tracking_uuid, current_status, carrier_name, carrier_tracking_number, customer_phone, customer_name, product_name, carrier_metadata')
        .eq('merchant_id', event.merchantId)
        .eq('carrier_tracking_number', event.carrierTrackingNumber);

      if (event.carrierName) query = query.eq('carrier_name', event.carrierName);
      const { data } = await query.maybeSingle();
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