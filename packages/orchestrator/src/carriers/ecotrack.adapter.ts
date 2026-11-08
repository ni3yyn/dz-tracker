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
      statusTitle: parsed.statusTitle || 'جاري متابعة حالة الشحنة لدى شركة التوصيل',
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
  ): { statusRaw: string; statusTitle?: string; description: string } {
    const status = normalizeDiacritics(safeLower(statusRaw));
    const reason = normalizeDiacritics(safeLower(reasonRaw));
    const statusKey = status.replace(/[\s-]+/g, '_');

    // EcoTrack account APIs expose stable enum keys (unlike the French labels
    // that vary between tenants). Handle those keys explicitly before fuzzy
    // text matching so list and bulk-status syncs map consistently.
    const exactStatuses: Record<string, { statusRaw: string; statusTitle: string; description: string }> = {
      // Stable EcoTrack order/activity keys. French tenant labels vary between couriers.
      prete_a_expedier: { statusRaw: 'processing', statusTitle: 'الشحنة جاهزة للإرسال', description: 'تم تسجيل الشحنة وهي جاهزة للإرسال إلى شركة التوصيل 📦' },
      prete_a_preparer: { statusRaw: 'processing', statusTitle: 'الشحنة قيد التحضير', description: 'تم تسجيل الشحنة وهي بانتظار استكمال تجهيزها 📦' },
      order_information_received_by_carrier: { statusRaw: 'processing', statusTitle: 'استلمت شركة التوصيل بيانات الشحنة', description: 'استلمت شركة التوصيل معلومات الشحنة وتم تسجيلها في نظامها 📦' },
      en_preparation_stock: { statusRaw: 'processing', statusTitle: 'الشحنة قيد التحضير بالمخزن', description: 'الشحنة قيد التحضير في مخزن شركة التوصيل 📦' },
      en_ramassage: { statusRaw: 'processing', statusTitle: 'الشحنة بانتظار الاستلام', description: 'الشحنة بانتظار استلامها من المتجر 📦' },
      picked: { statusRaw: 'dispatched', statusTitle: 'استلمت شركة التوصيل الشحنة', description: 'استلمت شركة التوصيل الطرد من المتجر وبدأت عملية نقله 🚚' },
      accepted_by_carrier: { statusRaw: 'dispatched', statusTitle: 'قبلت شركة التوصيل الشحنة', description: 'تم قبول الشحنة لدى شركة التوصيل وبدأت معالجتها 🚚' },
      vers_hub: { statusRaw: 'in_transit', statusTitle: 'الشحنة في الطريق إلى مركز الفرز', description: 'الشحنة في طريقها إلى مركز الفرز التابع لشركة التوصيل 🚛' },
      en_hub: { statusRaw: 'at_local_hub', statusTitle: 'وصلت الشحنة إلى مركز الفرز', description: 'وصلت الشحنة إلى مركز الفرز أو التوزيع لدى شركة التوصيل 📍' },
      vers_wilaya: { statusRaw: 'in_transit', statusTitle: 'الشحنة في الطريق إلى ولاية الوجهة', description: 'غادرت الشحنة مركزها وهي في طريقها إلى ولاية الوجهة 🚛' },
      en_preparation: { statusRaw: 'in_transit', statusTitle: 'الشحنة قيد المعالجة لدى شركة التوصيل', description: 'تتم معالجة الشحنة وتجهيزها للمرحلة التالية من النقل 📦' },
      dispatched_to_driver: { statusRaw: 'out_for_delivery', statusTitle: 'أُسندت الشحنة إلى مندوب التوصيل', description: 'تم إسناد الشحنة إلى مندوب التوصيل تمهيداً لتسليمها 🛵' },
      attempt_delivery: { statusRaw: 'out_for_delivery', statusTitle: 'محاولة تسليم الشحنة', description: 'مندوب التوصيل بصدد محاولة تسليم الشحنة إلى الزبون 🛵' },
      en_livraison: { statusRaw: 'out_for_delivery', statusTitle: 'خرجت الشحنة للتوصيل', description: 'خرجت الشحنة مع مندوب التوصيل إلى عنوانك 🛵' },
      suspendu: { statusRaw: 'held_at_hub', statusTitle: 'الشحنة معلّقة مؤقتاً', description: 'تم تعليق الشحنة مؤقتاً لدى شركة التوصيل، وستظهر التفاصيل عند توفر تحديث جديد ⏸️' },
      livred: { statusRaw: 'delivered', statusTitle: 'تم تسليم الشحنة', description: 'تم تسليم الشحنة بنجاح إلى المستلم ✅' },
      livre_non_encaisse: { statusRaw: 'delivered', statusTitle: 'تم التسليم وبانتظار تحصيل المبلغ', description: 'تم تسليم الشحنة، لكن مبلغ الدفع عند الاستلام لم تتم تسويته بعد ✅' },
      encaissed: { statusRaw: 'delivered', statusTitle: 'تم التسليم وتحصيل المبلغ', description: 'تم تسليم الشحنة واستلام المبلغ المستحق بنجاح ✅' },
      encaisse_non_paye: { statusRaw: 'delivered', statusTitle: 'تم تحصيل المبلغ وبانتظار تحويله', description: 'تم تسليم الشحنة وتحصيل المبلغ، وهو بانتظار تحويله إلى المتجر ✅' },
      payed: { statusRaw: 'delivered', statusTitle: 'تمت تسوية مبلغ الشحنة', description: 'اكتملت تسوية المبلغ المرتبط بالشحنة بنجاح ✅' },
      paiements_prets: { statusRaw: 'delivered', statusTitle: 'مبلغ الشحنة جاهز للتسوية', description: 'تم تسليم الشحنة وأصبح مبلغها جاهزاً للتسوية مع المتجر ✅' },
      paye_et_archive: { statusRaw: 'delivered', statusTitle: 'اكتملت الشحنة والتسوية', description: 'اكتملت عملية التسليم وتمت تسوية المبلغ وأرشفة الشحنة ✅' },
      return_asked: { statusRaw: 'returned', statusTitle: 'طُلب إرجاع الشحنة', description: 'بدأت إجراءات إرجاع الشحنة إلى المتجر 🔄' },
      return_in_transit: { statusRaw: 'returned', statusTitle: 'الشحنة في طريق العودة', description: 'الشحنة في طريق عودتها إلى المتجر 🔄' },
      return_received: { statusRaw: 'returned', statusTitle: 'تم استلام الشحنة المرتجعة', description: 'تم استلام الشحنة المرتجعة لدى شركة التوصيل 🔄' },
      retour_chez_livreur: { statusRaw: 'returned', statusTitle: 'الشحنة لدى مندوب الإرجاع', description: 'الشحنة موجودة ضمن مسار الإرجاع لدى شركة التوصيل 🔄' },
      retour_transit_entrepot: { statusRaw: 'returned', statusTitle: 'الشحنة في طريقها إلى المستودع', description: 'الشحنة المرتجعة في طريقها إلى مستودع شركة التوصيل 🔄' },
      retour_en_traitement: { statusRaw: 'returned', statusTitle: 'تتم معالجة إرجاع الشحنة', description: 'تقوم شركة التوصيل بمعالجة طلب إرجاع الشحنة 🔄' },
      retour_recu: { statusRaw: 'returned', statusTitle: 'وصلت الشحنة المرتجعة', description: 'تم استلام الشحنة المرتجعة لدى شركة التوصيل 🔄' },
      retour_archive: { statusRaw: 'returned', statusTitle: 'اكتملت عملية الإرجاع', description: 'اكتملت إجراءات الإرجاع وأُرشفت الشحنة 🔄' },
      annule: { statusRaw: 'cancelled', statusTitle: 'تم إلغاء الشحنة', description: 'تم إلغاء الشحنة لدى شركة التوصيل.' },
      // Informational remark, not a lifecycle stage.
      notification_on_order: { statusRaw: 'processing', statusTitle: 'ملاحظة من شركة التوصيل', description: reasonRaw ? `ملاحظة شركة التوصيل: ${reasonRaw}` : 'لدى شركة التوصيل ملاحظة مرتبطة بالطلب.' },
    };
    if (exactStatuses[statusKey]) return exactStatuses[statusKey];

    const hub = extractFirst(payload, ['hub', 'center', 'agence', 'centre', 'depot']) || '';
    const wilaya = extractFirst(payload, ['wilaya', 'destination', 'wilaya_name']) || '';

    // 1. الإنشاء والاستلام الأولي (Ramassage)
    if (status.includes('cree') || status.includes('en attente') || status.includes('draft') || status.includes('attente ramassage')) {
      return {
        statusRaw: 'processing',
        statusTitle: 'تم تسجيل الشحنة لدى شركة التوصيل',
        description: `تم تسجيل الشحنة لدى ${carrierName} وهي قيد التجهيز للاستلام من المتجر`,
      };
    }

    if (status.includes('ramasse') || status.includes('enleve') || status.includes('recu hub') || status.includes('collecte')) {
      return {
        statusRaw: 'dispatched',
        statusTitle: 'استلمت شركة التوصيل الشحنة من المتجر',
        description: `استلمت شركة ${carrierName} الطرد من المتجر وبدأت عملية التوجيه`,
      };
    }

    // 2. النقل والعبور بين المراكز (Transit inter-wilayas)
    if (status.includes('transit') || status.includes('transfert') || status.includes('vers hub')) {
      return {
        statusRaw: 'in_transit',
        statusTitle: 'الشحنة في الطريق إلى وجهتها',
        description: wilaya
          ? `الشحنة في طريقها إلى ولاية ${wilaya} عبر شبكة النقل السريع 🚛`
          : 'الشحنة في شاحنة النقل السريع متجهة إلى ولاية الوجهة',
      };
    }

    // 3. الوصول للوكالة أو مكتب الـ Stopdesk
    if (status.includes('stopdesk') || status.includes('au bureau') || status.includes('disponible')) {
      return {
        statusRaw: 'ready_for_pickup',
        statusTitle: 'الشحنة جاهزة للاستلام',
        description: hub
          ? `طردك متوفر وجاهز للاستلام الآن من مكتب التوصيل (${hub}) 🏢`
          : 'طردك جاهز للاستلام الآن من مكتب شركة التوصيل في ولايتك 🏢',
      };
    }

    if (status.includes('centre') || status.includes('au hub') || status.includes('dispatch') || status.includes('hub local')) {
      return {
        statusRaw: 'at_local_hub',
        statusTitle: 'وصلت الشحنة إلى مركز التوزيع',
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
          statusTitle: 'تعذّر التواصل مع الزبون',
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
          statusTitle: 'هاتف الزبون غير متاح',
          description: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال حالياً، يرجى تشغيل الهاتف للتنسيق مع المندوب 📵',
        };
      }
      if (reason.includes('absent') || reason.includes('client absent')) {
        return {
          statusRaw: 'attempt_failed',
          statusTitle: 'تعذّر التسليم في هذه المحاولة',
          description: 'تنبيه: المندوب وصل للعنوان والزبون غير متواجد، سيتم إعادة المحاولة لاحقاً ⚠️',
        };
      }
      return {
        statusRaw: 'attempt_failed',
        statusTitle: 'تعذّر التسليم في هذه المحاولة',
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
        statusTitle: 'خرجت الشحنة للتوصيل',
        description: `مندوب ${carrierName} في طريقه إلى عنوانك اليوم، يرجى إبقاء هاتفك قريباً منك 🛵`,
      };
    }

    if (status.includes('reporte') || reason.includes('reporte') || reason.includes('date ulterieure')) {
      return {
        statusRaw: 'postponed',
        statusTitle: 'تم تأجيل موعد التسليم',
        description: 'تم تأجيل موعد تسليم الشحنة بناءً على رغبتك إلى موعد لاحق 🗓️',
      };
    }

    // 6. التسليم النهائي
    if (status.includes('livre') || status.includes('paye') || status.includes('encaisse')) {
      return {
        statusRaw: 'delivered',
        statusTitle: 'تم تسليم الشحنة',
        description: 'تم تسليم الشحنة واستلام المبلغ بنجاح! نشكركم على ثقتكم بنا ✅',
      };
    }

    // 7. الإلغاء والإرجاع (Retour)
    if (status.includes('retour') || status.includes('refuse') || status.includes('annule') || status.includes('retourne')) {
      return {
        statusRaw: 'returned',
        statusTitle: 'جاري إرجاع الشحنة إلى المتجر',
        description: 'تعذر تسليم الشحنة وجاري إرجاع الطرد إلى المتجر 🔄',
      };
    }

    return {
      statusRaw: statusRaw ? safeLower(statusRaw) : 'processing',
      statusTitle: 'حالة الشحنة قيد المتابعة',
      description: `جاري متابعة وضعية الشحنة مع شركة ${carrierName}`,
    };
  }
}