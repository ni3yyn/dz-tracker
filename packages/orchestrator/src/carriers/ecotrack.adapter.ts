import { TrackingEvent } from '../index';

export class EcoTrackAdapter {
  /**
   * تحويل Payload نظام EcoTrack إلى صيغة TrackingEvent الموحدة
   */
  static normalize(merchantId: string, payload: any): TrackingEvent {
    // إيكوتراك ترسل عادة tracking_code أو code، ورقم الطلب الخاص بالمتجر reference أو order_id
    const trackingNumber =
      payload.tracking_code ||
      payload.tracking ||
      payload.barcode ||
      payload.code ||
      undefined;

    const externalOrderId =
      payload.reference ||
      payload.order_id ||
      payload.order_number ||
      payload.external_id ||
      trackingNumber ||
      'UNKNOWN_ORDER';

    // اسم شركة التوصيل المحددة (مثلاً NOEST أو DHD)، وإن لم ترسل نضع EcoTrack Network
    const carrierName =
      payload.carrier_name ||
      payload.company_name ||
      payload.transporteur ||
      'EcoTrack Network';

    const customerName = payload.client_name || payload.customer_name || payload.name || undefined;
    const customerPhone = payload.client_phone || payload.phone || undefined;

    const rawStatus = (payload.status || payload.current_status || payload.statut || 'cree').toLowerCase().trim();
    const reason = (payload.reason || payload.motif || payload.sub_status || payload.comment || '').toLowerCase().trim();

    // فحص وتحليل حالات إيكوتراك
    const parsed = this.parseEcoTrackStatus(rawStatus, reason, payload, carrierName);

    return {
      merchantId,
      externalOrderId: String(externalOrderId),
      customerName,
      customerPhone,
      statusRaw: parsed.statusRaw,
      description: parsed.description,
      carrierName: carrierName,
      carrierTrackingNumber: trackingNumber,
    };
  }

  /**
   * ترجمة الحالات الميدانية لشبكة إيكوتراك إلى سيناريوهات عربية واضحة للزبون
   */
  private static parseEcoTrackStatus(
    status: string,
    reason: string,
    payload: any,
    carrierName: string
  ): { statusRaw: string; description: string } {
    const hub = payload.hub || payload.center || payload.agence || '';
    const wilaya = payload.wilaya || payload.destination || '';

    // 1. الإنشاء والاستلام الأولي (Ramassage)
    if (status.includes('cree') || status.includes('en_attente') || status.includes('draft')) {
      return {
        statusRaw: 'processing',
        description: `تم تسجيل الشحنة لدى ${carrierName} وهي قيد التجهيز للاستلام من المتجر`,
      };
    }

    if (status.includes('ramasse') || status.includes('enleve') || status.includes('recu_hub')) {
      return {
        statusRaw: 'dispatched',
        description: `استلمت شركة ${carrierName} الطرد من المتجر وبدأت عملية التوجيه`,
      };
    }

    // 2. النقل والعبور بين المراكز (Transit inter-wilayas)
    if (status.includes('transit') || status.includes('transfert') || status.includes('vers_hub')) {
      return {
        statusRaw: 'in_transit',
        description: wilaya
          ? `الشحنة في طريقها إلى ولاية ${wilaya} عبر شبكة النقل السريع 🚛`
          : 'الشحنة في شاحنة النقل السريع متجهة إلى ولاية الوجهة',
      };
    }

    // 3. الوصول للوكالة أو مكتب الـ Stopdesk
    if (status.includes('stopdesk') || status.includes('au_bureau') || status.includes('disponible')) {
      return {
        statusRaw: 'ready_for_pickup',
        description: hub
          ? `طردك متوفر وجاهز للاستلام الآن من مكتب التوصيل (${hub}) 🏢`
          : 'طردك جاهز للاستلام الآن من مكتب شركة التوصيل في ولايتك 🏢',
      };
    }

    if (status.includes('centre') || status.includes('au_hub') || status.includes('dispatch')) {
      return {
        statusRaw: 'at_local_hub',
        description: 'وصل الطرد إلى مركز التوزيع الإقليمي في ولايتك وجاري الفرز للتسليم 📍',
      };
    }

    // 4. خروج المندوب للتوصيل المنزلي
    if (status.includes('en_livraison') || status.includes('sorti') || status.includes('livreur')) {
      return {
        statusRaw: 'out_for_delivery',
        description: `مندوب ${carrierName} في طريقه إلى عنوانك اليوم، يرجى إبقاء هاتفك قريباً منك 🛵`,
      };
    }

    // 5. حالات التنبيه والأخطاء الميدانية (حماية التاجر من الـ Retour)
    if (status.includes('echoue') || status.includes('non_abouti') || status.includes('alerte')) {
      if (reason.includes('pas_de_reponse') || reason.includes('repond_pas') || reason.includes('injoignable')) {
        return {
          statusRaw: 'attempt_failed_no_answer',
          description: `تنبيه: حاول المندوب الاتصال بك ولم يتم الرد على الهاتف! يرجى الانتباه لهاتفك لإعادة التوصيل ⚠️`,
        };
      }
      if (reason.includes('ferme') || reason.includes('eteint') || reason.includes('hors_service')) {
        return {
          statusRaw: 'attempt_failed_unreachable',
          description: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال حالياً، يرجى تشغيل الهاتف للتنسيق مع المندوب 📵',
        };
      }
      if (reason.includes('absent')) {
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

    if (status.includes('reporte') || reason.includes('reporte') || reason.includes('date_ulterieure')) {
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
    if (status.includes('retour') || status.includes('refuse') || status.includes('annule')) {
      return {
        statusRaw: 'returned',
        description: 'تعذر تسليم الشحنة وجاري إرجاع الطرد إلى المتجر 🔄',
      };
    }

    return {
      statusRaw: status,
      description: `جاري متابعة وضعية الشحنة مع شركة ${carrierName}`,
    };
  }
}