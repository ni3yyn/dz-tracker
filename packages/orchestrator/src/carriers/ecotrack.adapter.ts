import { TrackingEvent } from '../index';
import {
  safeString,
  safeLower,
  normalizeDiacritics,
  extractFirst,
  normalizeAlgerianPhone,
} from '../utils/safe';

export class EcoTrackAdapter {
  /**
   * تحويل Payload نظام EcoTrack إلى صيغة TrackingEvent الموحدة بطريقة شديدة المتانة
   */
  static normalize(merchantId: string, rawPayload: any): TrackingEvent {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

    // 1. استخراج رقم الطرد وبوليصة الشحن بمرونة تشمل 80+ شركة شحن
    const trackingNumber = extractFirst(payload, [
      'tracking',
      'tracking_code',
      'trackingCode',
      'tracking_number',
      'tracking_id',
      'barcode',
      'code',
      'code_suivi',
      'n_tracking',
      'id',
    ]);

    const externalOrderId = extractFirst(
      payload,
      [
        'reference',
        'order_id',
        'order_number',
        'orderId',
        'orderNumber',
        'external_id',
        'code_commande',
      ],
      trackingNumber || 'UNKNOWN_ORDER'
    )!;

    // 2. اسم شركة التوصيل المحددة (NOEST, DHD, Conexlog, World Express...)
    const carrierName = extractFirst(
      payload,
      ['carrier_name', 'carrierName', 'company_name', 'transporteur', 'societe'],
      'EcoTrack Network'
    )!;

    // 3. بيانات العميل والهاتف المعرب
    const customerName = extractFirst(payload, [
      'client_name',
      'customer_name',
      'name',
      'nom_client',
      'destinataire',
      'client',
    ]);

    const rawPhone = extractFirst(payload, [
      'client_phone',
      'customer_phone',
      'phone',
      'telephone',
      'tel',
      'mobile',
      'contact_phone',
    ]);
    const customerPhone = normalizeAlgerianPhone(rawPhone);

    const rawStatus = extractFirst(
      payload,
      ['status', 'current_status', 'statut', 'etat'],
      'cree'
    );

    const rawReason = extractFirst(
      payload,
      ['reason', 'motif', 'sub_status', 'comment', 'remarque', 'observation'],
      ''
    );
    const productName = extractFirst(payload, [
      'product_name',
      'products',
      'product',
      'produit',
      'logistical_description',
    ]);

    // فحص وتحليل الحالات التشغيلية
    const parsed = this.parseEcoTrackStatus(rawStatus!, rawReason!, payload, carrierName);

    return {
      merchantId: safeString(merchantId),
      externalOrderId: safeString(externalOrderId),
      customerName: customerName ? safeString(customerName).replace(/[-_]$/, '').trim() : undefined,
      customerPhone: customerPhone || undefined,
      productName: productName ? safeString(productName).trim() : undefined,
      statusRaw: parsed.statusRaw,
      description: parsed.description,
      carrierName: carrierName,
      carrierTrackingNumber: trackingNumber || undefined,
    };
  }

  /**
   * ترجمة الحالات الميدانية لشبكة إيكوتراك إلى سيناريوهات عربية واضحة للزبون
   */
  private static parseEcoTrackStatus(
    statusRaw: string,
    reasonRaw: string,
    payload: any,
    carrierName: string
  ): { statusRaw: string; description: string } {
    const status = normalizeDiacritics(safeLower(statusRaw));
    const reason = normalizeDiacritics(safeLower(reasonRaw));
    const statusKey = status.replace(/[\\s-]+/g, '_');

    // EcoTrack account APIs expose stable enum keys (unlike the French labels
    // that vary between tenants). Handle those keys explicitly before fuzzy
    // text matching so list and bulk-status syncs map consistently.
    const exactStatuses: Record<string, { statusRaw: string; description: string }> = {
      prete_a_expedier: { statusRaw: 'processing', description: 'تم تسجيل الشحنة لدى شركة التوصيل وهي جاهزة للإرسال 📦' },
      prete_a_preparer: { statusRaw: 'processing', description: 'تم تسجيل الشحنة وهي قيد التجهيز لدى شركة التوصيل 📦' },
      en_preparation_stock: { statusRaw: 'processing', description: 'الشحنة قيد التحضير لدى شركة التوصيل 📦' },
      en_preparation: { statusRaw: 'processing', description: 'الشحنة قيد التحضير لدى شركة التوصيل 📦' },
      en_ramassage: { statusRaw: 'processing', description: 'الشحنة بانتظار استلامها من المتجر 📦' },
      order_information_received_by_carrier: { statusRaw: 'processing', description: 'استلمت شركة التوصيل معلومات الشحنة وتم تسجيلها 📦' },
      picked: { statusRaw: 'dispatched', description: 'استلمت شركة التوصيل الطرد وبدأت عملية التوجيه 🚚' },
      accepted_by_carrier: { statusRaw: 'dispatched', description: 'وصل الطرد إلى شركة التوصيل وبدأت عملية المعالجة 🚚' },
      vers_hub: { statusRaw: 'in_transit', description: 'الشحنة في طريقها إلى مركز الفرز 🚛' },
      vers_wilaya: { statusRaw: 'in_transit', description: 'الشحنة في طريقها إلى ولاية الوجهة 🚛' },
      en_hub: { statusRaw: 'at_local_hub', description: 'وصلت الشحنة إلى مركز التوزيع 📍' },
      dispatched_to_driver: { statusRaw: 'out_for_delivery', description: 'تم تسليم الشحنة إلى المندوب وهي في طريقها إليك 🛵' },
      attempt_delivery: { statusRaw: 'out_for_delivery', description: 'مندوب التوصيل يحاول تسليم شحنتك 🛵' },
      en_livraison: { statusRaw: 'out_for_delivery', description: 'مندوب التوصيل في طريقه إليك 🛵' },
      suspendu: { statusRaw: 'held_at_hub', description: 'تم تعليق الشحنة مؤقتاً لدى شركة التوصيل ⏸️' },
      livred: { statusRaw: 'delivered', description: 'تم تسليم الشحنة بنجاح ✅' },
      livre_non_encaisse: { statusRaw: 'delivered', description: 'تم تسليم الشحنة وهي بانتظار تسوية المبلغ ✅' },
      encaissed: { statusRaw: 'delivered', description: 'تم تسليم الشحنة واستلام المبلغ بنجاح ✅' },
      encaisse_non_paye: { statusRaw: 'delivered', description: 'تم تسليم الشحنة واستلام المبلغ وهي بانتظار تحويله ✅' },
      payed: { statusRaw: 'delivered', description: 'تمت تسوية مبلغ الشحنة بنجاح ✅' },
      paiements_prets: { statusRaw: 'delivered', description: 'تم تسليم الشحنة وأصبح مبلغها جاهزاً للتسوية ✅' },
      paye_et_archive: { statusRaw: 'delivered', description: 'اكتملت الشحنة وتمت تسوية المبلغ ✅' },
      return_asked: { statusRaw: 'returned', description: 'بدأت إجراءات إرجاع الشحنة إلى المتجر 🔄' },
      return_in_transit: { statusRaw: 'returned', description: 'الشحنة في طريق العودة إلى المتجر 🔄' },
      return_received: { statusRaw: 'returned', description: 'استلم المتجر الشحنة المرتجعة 🔄' },
      retour_chez_livreur: { statusRaw: 'returned', description: 'الشحنة في مسار الإرجاع لدى شركة التوصيل 🔄' },
      retour_transit_entrepot: { statusRaw: 'returned', description: 'الشحنة في طريقها إلى مستودع شركة التوصيل 🔄' },
      retour_en_traitement: { statusRaw: 'returned', description: 'تتم معالجة إرجاع الشحنة 🔄' },
      retour_recu: { statusRaw: 'returned', description: 'وصلت الشحنة المرتجعة إلى شركة التوصيل 🔄' },
      retour_archive: { statusRaw: 'returned', description: 'اكتملت عملية إرجاع الشحنة 🔄' },
      annule: { statusRaw: 'cancelled', description: 'تم إلغاء الشحنة لدى شركة التوصيل.' },
    };
    if (exactStatuses[statusKey]) return exactStatuses[statusKey];

    const hub = extractFirst(payload, ['hub', 'center', 'agence', 'centre', 'depot']) || '';
    const wilaya = extractFirst(payload, ['wilaya', 'destination', 'wilaya_name']) || '';

    // 1. الإنشاء والاستلام الأولي (Ramassage)
    if (status.includes('cree') || status.includes('en attente') || status.includes('draft') || status.includes('attente ramassage')) {
      return {
        statusRaw: 'processing',
        description: `تم تسجيل الشحنة لدى ${carrierName} وهي قيد التجهيز للاستلام من المتجر`,
      };
    }

    if (status.includes('ramasse') || status.includes('enleve') || status.includes('recu hub') || status.includes('collecte')) {
      return {
        statusRaw: 'dispatched',
        description: `استلمت شركة ${carrierName} الطرد من المتجر وبدأت عملية التوجيه`,
      };
    }

    // 2. النقل والعبور بين المراكز (Transit inter-wilayas)
    if (status.includes('transit') || status.includes('transfert') || status.includes('vers hub')) {
      return {
        statusRaw: 'in_transit',
        description: wilaya
          ? `الشحنة في طريقها إلى ولاية ${wilaya} عبر شبكة النقل السريع 🚛`
          : 'الشحنة في شاحنة النقل السريع متجهة إلى ولاية الوجهة',
      };
    }

    // 3. الوصول للوكالة أو مكتب الـ Stopdesk
    if (status.includes('stopdesk') || status.includes('au bureau') || status.includes('disponible')) {
      return {
        statusRaw: 'ready_for_pickup',
        description: hub
          ? `طردك متوفر وجاهز للاستلام الآن من مكتب التوصيل (${hub}) 🏢`
          : 'طردك جاهز للاستلام الآن من مكتب شركة التوصيل في ولايتك 🏢',
      };
    }

    if (status.includes('centre') || status.includes('au hub') || status.includes('dispatch') || status.includes('hub local')) {
      return {
        statusRaw: 'at_local_hub',
        description: 'وصل الطرد إلى مركز التوزيع الإقليمي في ولايتك وجاري الفرز للتسليم 📍',
      };
    }

    // 4. 🚨 حالات التنبيه والأخطاء الميدانية ورادار الـ COD (يجب فحصها أولاً لتفادي كلمات التوصيل)
    if (
      status.includes('echoue') ||
      status.includes('echec') ||
      status.includes('non abouti') ||
      status.includes('alerte') ||
      status.includes('probleme') ||
      status.includes('injoignable') ||
      status.includes('pas de reponse') ||
      reason.includes('pas de reponse') ||
      reason.includes('repond pas') ||
      reason.includes('injoignable')
    ) {
      if (
        status.includes('pas de reponse') ||
        status.includes('repond pas') ||
        status.includes('injoignable') ||
        reason.includes('pas de reponse') ||
        reason.includes('repond pas') ||
        reason.includes('sans reponse') ||
        reason.includes('injoignable')
      ) {
        return {
          statusRaw: 'attempt_failed_no_answer',
          description: `تنبيه: حاول مندوب ${carrierName} الاتصال بك ولم يتم الرد على الهاتف! يرجى الانتباه لهاتفك لإعادة التوصيل ⚠️`,
        };
      }
      if (
        status.includes('hors zone') ||
        reason.includes('ferme') ||
        reason.includes('eteint') ||
        reason.includes('hors service') ||
        reason.includes('hors zone')
      ) {
        return {
          statusRaw: 'attempt_failed_unreachable',
          description: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال حالياً، يرجى تشغيل الهاتف للتنسيق مع المندوب 📵',
        };
      }
      if (reason.includes('absent') || reason.includes('client absent')) {
        return {
          statusRaw: 'attempt_failed',
          description: 'تنبيه: المندوب وصل للعنوان والزبون غير متواجد، سيتم إعادة المحاولة لاحقاً ⚠️',
        };
      }
      return {
        statusRaw: 'attempt_failed',
        description: 'تعذر إتمام التسليم في هذه المحاولة، وسيتم التنسيق لإعادة المحاولة ⚠️',
      };
    }

    // 5. خروج المندوب للتوصيل المنزلي
    if (
      status.includes('sorti') ||
      status.includes('livreur') ||
      status.includes('en livraison') ||
      status.includes('en cours livraison') ||
      (status.includes('distribution') && !status.includes('echec'))
    ) {
      return {
        statusRaw: 'out_for_delivery',
        description: `مندوب ${carrierName} في طريقه إلى عنوانك اليوم، يرجى إبقاء هاتفك قريباً منك 🛵`,
      };
    }

    if (status.includes('reporte') || reason.includes('reporte') || reason.includes('date ulterieure')) {
      return {
        statusRaw: 'postponed',
        description: 'تم تأجيل موعد تسليم الشحنة بناءً على رغبتك إلى موعد لاحق 🗓️',
      };
    }

    // 6. التسليم النهائي
    if (status.includes('livre') || status.includes('paye') || status.includes('encaisse')) {
      return {
        statusRaw: 'delivered',
        description: 'تم تسليم الشحنة واستلام المبلغ بنجاح! نشكركم على ثقتكم بنا ✅',
      };
    }

    // 7. الإلغاء والإرجاع (Retour)
    if (status.includes('retour') || status.includes('refuse') || status.includes('annule') || status.includes('retourne')) {
      return {
        statusRaw: 'returned',
        description: 'تعذر تسليم الشحنة وجاري إرجاع الطرد إلى المتجر 🔄',
      };
    }

    return {
      statusRaw: statusRaw ? safeLower(statusRaw) : 'processing',
      description: `جاري متابعة وضعية الشحنة مع شركة ${carrierName}`,
    };
  }
}