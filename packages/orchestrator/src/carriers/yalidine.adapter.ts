import { TrackingEvent } from '../index';
import {
  safeString,
  safeLower,
  normalizeDiacritics,
  extractFirst,
  normalizeAlgerianPhone,
} from '../utils/safe';

export class YalidineAdapter {
  /**
   * تحويل payload ياليدين إلى صيغة TrackingEvent المعيارية بطريقة آمنة تماماً ضد الأخطاء
   */
  static normalize(merchantId: string, rawPayload: any): TrackingEvent {
    // حماية ضد الـ null أو الـ undefined أو البيانات غير الكائنية
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

    // 1. استخراج رقم التتبع ورقم الطلب بمرونة عالية (يدعم Yalidine / Guepex / Odoo)
    const trackingNumber = extractFirst(payload, [
      'tracking',
      'tracking_number',
      'carrier_tracking_ref', // Odoo Yalidine connector
      'trackingNumber',
      'id',
      'code_suivi',
      'barcode',
      'Tracking',
    ]);

    const externalOrderId = extractFirst(
      payload,
      [
        'order_id',
        'external_order_id',
        'order_number',
        'origin', // Odoo Sale Order reference
        'sale_order',
        'picking_name',
        'orderId',
        'orderNumber',
        'reference',
      ],
      trackingNumber || 'UNKNOWN_ORDER'
    )!;

    // 2. استخراج بيانات العميل مع تنظيف الهاتف
    const combinedName =
      payload.firstname && payload.familyname
        ? `${payload.firstname} ${payload.familyname}`.trim()
        : null;

    const customerName =
      combinedName ||
      extractFirst(payload, [
        'customer_name',
        'firstname',
        'client_name',
        'partner_name', // Odoo Partner
        'recipient_name',
        'nom',
        'client',
      ]);

    const rawPhone = extractFirst(payload, [
      'customer_phone',
      'contact_phone', // Yalidine official API
      'phone',
      'telephone',
      'tel',
      'client_phone',
      'mobile',
    ]);
    const customerPhone = normalizeAlgerianPhone(rawPhone);

    // 3. استخراج الحالة والمبرر (Motif / Reason) وتنظيف الحروف اللاتينية
    const rawStatus = extractFirst(payload, [
      'last_status',
      'status',
      'statut',
      'current_status',
      'etat',
    ], 'en_preparation');

    const rawReason = extractFirst(payload, [
      'reason',
      'sub_status',
      'motif',
      'commentaire',
      'comment',
    ], '');

    // تحليل دقيق ومقاوم للحروف والأشكال المختلفة
    const parsed = this.parseYalidineStatus(rawStatus!, rawReason!, payload);

    return {
      merchantId: safeString(merchantId),
      externalOrderId: safeString(externalOrderId),
      customerName: customerName ? safeString(customerName).replace(/[-_]$/, '').trim() : undefined,
      customerPhone: customerPhone || undefined,
      statusRaw: parsed.statusRaw,
      description: parsed.description,
      carrierName: 'Yalidine Express',
      carrierTrackingNumber: trackingNumber || undefined,
    };
  }

  /**
   * القاموس الذكي لتحويل حالات ياليدين الفرنسية الدقيقة إلى حالات وسيناريوهات عربية
   */
  private static parseYalidineStatus(
    statusRaw: string,
    reasonRaw: string,
    payload: any
  ): { statusRaw: string; description: string } {
    const status = normalizeDiacritics(safeLower(statusRaw));
    const reason = normalizeDiacritics(safeLower(reasonRaw));

    const center = extractFirst(payload, [
      'stopdesk_name',
      'center_name',
      'current_center_name',
      'agency_name',
      'bureau_name',
      'center',
      'centre',
      'hub',
      'stopdesk',
    ]) || '';
    const wilaya = extractFirst(payload, [
      'to_wilaya_name',
      'current_wilaya_name',
      'wilaya_name',
      'wilaya',
      'destination',
    ]) || '';
    const isStopdesk =
      payload.is_stopdesk === true ||
      payload.is_stopdesk === 1 ||
      payload.is_stopdesk === '1' ||
      payload.delivery_type === 'stopdesk' ||
      payload.type_livraison === '1';

    // 1. حالات التجهيز والاستلام الأولي
    if (
      status.includes('preparation') ||
      status.includes('pret a expedier') ||
      status.includes('pas encore') ||
      status === 'cree' ||
      status === 'draft' ||
      status.includes('a verifier')
    ) {
      return {
        statusRaw: 'processing',
        description: 'تم تسجيل الشحنة في نظام ياليدين وجاري تجهيزها للاستلام من المتجر 📦',
      };
    }

    if (status.includes('expedie') || status.includes('ramasse') || status.includes('recu au centre')) {
      return {
        statusRaw: 'dispatched',
        description: 'استلم مندوب ياليدين الطرد وهو في طريقه إلى مركز الشحن الرئيسي 🚚',
      };
    }

    // 2. النقل بين الولايات (Hubs Transit)
    if (status.includes('vers wilaya') || status.includes('transfert') || status.includes('transit')) {
      return {
        statusRaw: 'in_transit',
        description: wilaya
          ? `طردك في شاحنة النقل السريع متجهاً إلى مركز ياليدين في ولاية ${wilaya} 🚛`
          : 'الشحنة في طريقها بين الولايات عبر شبكة النقل السريع 🚛',
      };
    }

    // 3. 🚨 الحالات الحرجة ومحاولات الاتصال الفاشلة (رادار مخاطر الـ COD - فحص أولي مبكر)
    if (
      status.includes('echoue') ||
      status.includes('tentative') ||
      status.includes('alerte') ||
      status.includes('echec') ||
      reason.includes('repond pas') ||
      reason.includes('pas de reponse') ||
      reason.includes('sans reponse') ||
      reason.includes('absent') ||
      reason.includes('no-show') ||
      reason.includes('injoignable') ||
      reason.includes('faux numero')
    ) {
      if (
        reason.includes('repond pas') ||
        reason.includes('pas de reponse') ||
        reason.includes('sans reponse') ||
        reason.includes('absent') ||
        reason.includes('no-show')
      ) {
        return {
          statusRaw: 'attempt_failed_no_answer',
          description: 'تنبيه: حاول مندوب ياليدين الاتصال بك لتسليم الشحنة ولم يتم الرد! يرجى الانتباه لهاتفك لإعادة المحاولة ⚠️',
        };
      }
      if (
        reason.includes('injoignable') ||
        reason.includes('ferme') ||
        reason.includes('eteint') ||
        reason.includes('hors service') ||
        reason.includes('faux numero')
      ) {
        return {
          statusRaw: 'attempt_failed_unreachable',
          description: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال! يرجى تشغيل الهاتف للتنسيق مع المندوب 📵',
        };
      }
      if (reason.includes('incapable de payer')) {
        return {
          statusRaw: 'attempt_failed',
          description: 'تعذر التسليم: الزبون غير جاهز لدفع مبلغ الشحنة عند الاستلام، جاري التنسيق ⚠️',
        };
      }
      return {
        statusRaw: 'attempt_failed',
        description: 'تعذر تسليم الشحنة في هذه المحاولة، وسيتم التنسيق لإعادة محاولة التوصيل ⚠️',
      };
    }

    // 4. الوصول للمركز المحلي أو مكتب الـ Stopdesk (Bureaux Yalidine)
    if (
      status.includes('disponible') ||
      status.includes('bureau') ||
      status.includes('stopdesk') ||
      status.includes('en attente du client') ||
      (isStopdesk && (status.includes('centre') || status.includes('arrive') || status.includes('localise') || status.includes('recu a wilaya')))
    ) {
      const agencyName = center || wilaya;
      return {
        statusRaw: 'ready_for_pickup',
        description: agencyName
          ? `طردك جاهز للاستلام الآن من مكتب ياليدين (${agencyName}) 🏢`
          : 'طردك جاهز للاستلام الآن من مكتب ياليدين في ولايتك 🏢',
      };
    }

    if (
      status.includes('centre') ||
      status.includes('tri') ||
      status.includes('localisation') ||
      status.includes('recu a wilaya')
    ) {
      return {
        statusRaw: 'at_local_hub',
        description: wilaya
          ? `وصل الطرد إلى مركز التوزيع في ولاية ${wilaya} ويتم فرزه للتسليم 📍`
          : 'وصل الطرد إلى مركز التوزيع في ولايتك ويتم فرزه للتسليم 📍',
      };
    }

    // 5. خروج المندوب للتوصيل إلى المنزل
    if (status.includes('sorti') || status.includes('en livraison') || status.includes('pret pour livreur')) {
      return {
        statusRaw: 'out_for_delivery',
        description: 'مندوب ياليدين في طريقه إلى عنوانك اليوم للتسليم، يرجى إبقاء هاتفك متاحاً 🛵',
      };
    }

    // 6. حالات التعليق والإيقاف الإداري (Bloqué / Débloqué)
    if (status.includes('bloque') && !status.includes('debloque')) {
      return {
        statusRaw: 'held_at_hub',
        description: 'تم تعليق الشحنة مؤقتاً في مركز ياليدين لمراجعة البيانات أو المستندات ⏸️',
      };
    }

    if (status.includes('reporte') || reason.includes('reporte')) {
      return {
        statusRaw: 'postponed',
        description: 'تم تأجيل موعد تسليم الشحنة بناءً على طلبك إلى موعد لاحق 🗓️',
      };
    }

    // 7. التسليم النهائي وقبض المبلغ
    if (status.includes('livre') || status.includes('encaisse') || status.includes('paye')) {
      return {
        statusRaw: 'delivered',
        description: 'تم تسليم الشحنة واستلام المبلغ نقداً بنجاح! شكراً لثقتكم بنا ✅',
      };
    }

    // 8. حالات الإرجاع (Retour)
    if (
      status.includes('retour') ||
      status.includes('annule') ||
      status.includes('refuse') ||
      status.includes('echange echoue')
    ) {
      if (status.includes('a retirer')) {
        return {
          statusRaw: 'returned',
          description: 'طرد الإرجاع متاح الآن في وكالة ياليدين لاستلامه من طرف المتجر 🔄',
        };
      }
      return {
        statusRaw: 'returned',
        description: 'فشلت محاولات التوصيل وجاري إرجاع الطرد إلى المتجر 🔄',
      };
    }

    // الحالة الافتراضية المقاومة
    return {
      statusRaw: statusRaw ? safeLower(statusRaw) : 'processing',
      description: 'جاري متابعة وتحديث وضعية الشحنة مع ياليدين',
    };
  }
}