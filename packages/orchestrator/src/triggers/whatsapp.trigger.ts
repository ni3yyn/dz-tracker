import { TriggerHandler, TriggerContext, TriggerResult } from './types';
import { normalizeAlgerianPhone } from '../utils/safe';

export class WhatsAppAlertTrigger implements TriggerHandler {
  name = 'WhatsAppCriticalAlert';

  // Critical delivery states requiring proactive communication to prevent COD returns (Retours)
  private criticalStates = new Set([
    'attempt_failed_no_answer',
    'attempt_failed_unreachable',
    'attempt_failed',
    'ready_for_pickup',
    'out_for_delivery',
    'postponed',
  ]);

  canTrigger(ctx: TriggerContext): boolean {
    if (!ctx.statusChanged && !ctx.isNewOrder) return false;
    if (!ctx.event.customerPhone) return false;
    const normStatus = (ctx.event.statusRaw || '').toLowerCase().trim();
    return this.criticalStates.has(normStatus);
  }

  async execute(ctx: TriggerContext): Promise<TriggerResult> {
    try {
      const { event, trackingUuid, siteUrl, merchant } = ctx;
      const phone = normalizeAlgerianPhone(event.customerPhone);

      if (!phone) {
        return {
          triggerName: this.name,
          channel: 'whatsapp',
          triggered: false,
          error: 'No valid phone number found for customer',
        };
      }

      const trackingUrl = `${siteUrl}/t/${trackingUuid}`;
      const customerName = event.customerName || 'عميلنا العزيز';
      const orderNumber = event.externalOrderId;
      const storeName = merchant.store_name || 'المتجر';

      const normStatus = (event.statusRaw || '').toLowerCase().trim();
      let urgency: 'critical' | 'high' | 'medium' | 'info' = 'medium';
      let message = '';

      switch (normStatus) {
        case 'attempt_failed_no_answer':
          urgency = 'critical';
          message = `⚠️ *تنبيه عاجل من ${storeName}*\n\nمرحباً ${customerName}،\nحاول مندوب التوصيل الاتصال بك لتسليم طلبك رقم (${orderNumber}) لكن لم يتم الرد.\n\nيرجى فتح رابط التتبع الآن والتأكد من إبقاء هاتفك متاحاً لتفادي إلغاء الشحنة وإرجاعها:\n${trackingUrl}`;
          break;

        case 'attempt_failed_unreachable':
          urgency = 'critical';
          message = `📵 *تنبيه من ${storeName}*\n\nمرحباً ${customerName}،\nرقم هاتفك كان غير متاح عند محاولة المندوب التنسيق لتسليم طلبك رقم (${orderNumber}).\n\nيرجى فتح الرابط لتأكيد توفرك وتتبع مكان الطرد:\n${trackingUrl}`;
          break;

        case 'ready_for_pickup':
          urgency = 'high';
          message = `🏢 *طردك جاهز للاستلام من ${storeName}*\n\nمرحباً ${customerName}،\nشحنتك رقم (${orderNumber}) متوفرة وجاهزة للاستلام الآن من مكتب شركة الشحن (Stopdesk).\n\nتفاصيل المكتب وموقع الاستلام:\n${trackingUrl}`;
          break;

        case 'out_for_delivery':
          urgency = 'medium';
          message = `🛵 *شحنتك في الطريق اليوم من ${storeName}*\n\nمرحباً ${customerName}،\nطلبك رقم (${orderNumber}) مع مندوب التوصيل للتسليم اليوم.\nيرجى إبقاء هاتفك قريباً منك وتجهيز مبلغ الطلب نقداً عند الاستلام.\n\nتتبع مسار التوصيل المباشر:\n${trackingUrl}`;
          break;

        case 'postponed':
          urgency = 'info';
          message = `🗓️ *تأكيد تأجيل موعد التسليم - ${storeName}*\n\nمرحباً ${customerName}،\nتم تسجيل طلب تأجيل تسليم شحنتك رقم (${orderNumber}). يمكنك دائماً مراجعة الحالة المحدثة هنا:\n${trackingUrl}`;
          break;

        default:
          urgency = 'medium';
          message = `📦 *تحديث حالة طلبك من ${storeName}*\n\nمرحباً ${customerName}،\nتم تحديث حالة طلبك رقم (${orderNumber}) إلى: ${ctx.displayStatus}.\n\nلمتابعة التفاصيل لحظة بلحظة:\n${trackingUrl}`;
          break;
      }

      const waActionUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      return {
        triggerName: this.name,
        channel: 'whatsapp',
        triggered: true,
        urgency,
        dispatchedTo: phone,
        message,
        actionUrl: waActionUrl,
        payload: {
          phone,
          customerName,
          orderNumber,
          statusRaw: normStatus,
          displayStatus: ctx.displayStatus,
          trackingUrl,
          urgency,
        },
      };
    } catch (err: any) {
      return {
        triggerName: this.name,
        channel: 'whatsapp',
        triggered: false,
        error: err?.message || 'Error executing WhatsApp trigger',
      };
    }
  }
}
