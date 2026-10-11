import { TrackingEvent } from '../index';

export class YalidineAdapter {
  /**
   * تحويل payload ياليدين إلى صيغة TrackingEvent المعيارية
   */
  static normalize(merchantId: string, payload: any): TrackingEvent {
    // ياليدين ترسل رقم الطرد (tracking) ورقم الطلب الخاص بالمتجر (order_id)
    const trackingNumber =
      payload.tracking ||
      payload.tracking_number ||
      payload.id ||
      undefined;

    const externalOrderId =
      payload.order_id ||
      payload.external_order_id ||
      payload.order_number ||
      trackingNumber ||
      'UNKNOWN_ORDER';

    const customerName = payload.customer_name || payload.firstname || undefined;
    const customerPhone = payload.customer_phone || payload.phone || undefined;

    // استخراج الحالة الرئيسية والفرعية (السبب / Motif)
    const rawStatus = (payload.last_status || payload.status || 'en_preparation').toLowerCase().trim();
    const reason = (payload.reason || payload.sub_status || payload.motif || '').toLowerCase().trim();

    // تحليل دقيق لحالات ياليدين التشغيلية
    const parsed = this.parseYalidineStatus(rawStatus, reason, payload);

    return {
      merchantId,
      externalOrderId: String(externalOrderId),
      customerName,
      customerPhone,
      statusRaw: parsed.statusRaw,
      description: parsed.description,
      carrierName: 'Yalidine Express',
      carrierTrackingNumber: trackingNumber,
    };
  }

  /**
   * القاموس الذكي لتحويل حالات ياليدين الفرنسية الدقيقة إلى حالات وسيناريوهات عربية
   */
  private static parseYalidineStatus(
    status: string,
    reason: string,
    payload: any
  ): { statusRaw: string; description: string } {
    const center = payload.center_name || payload.center || '';
    const wilaya = payload.wilaya_name || payload.wilaya || '';

    // 1. حالات التجهيز والاستلام الأولي
    if (status.includes('préparation') || status === 'créé' || status === 'draft') {
      return {
        statusRaw: 'processing',
        description: 'تم تسجيل الشحنة في نظام ياليدين وجاري تجهيزها للاستلام من المتجر',
      };
    }

    if (status.includes('expédié') || status.includes('ramassé') || status.includes('reçu au centre')) {
      return {
        statusRaw: 'dispatched',
        description: 'استلم مندوب ياليدين الطرد وهو في طريقه إلى مركز الشحن الرئيسي',
      };
    }

    // 2. النقل بين الولايات (Hubs Transit)
    if (status.includes('vers wilaya') || status.includes('transfert') || status.includes('transit')) {
      return {
        statusRaw: 'in_transit',
        description: wilaya
          ? `طردك في شاحنة النقل السريع متجهاً إلى مركز ياليدين في ولاية ${wilaya}`
          : 'الشحنة في طريقها بين الولايات عبر شبكة النقل السريع',
      };
    }

    // 3. الوصول للمركز المحلي أو مكتب الـ Stopdesk
    if (status.includes('disponible') || status.includes('bureau') || status.includes('stopdesk')) {
      return {
        statusRaw: 'ready_for_pickup',
        description: center
          ? `طردك جاهز للاستلام الآن من مكتب ياليدين (${center})`
          : 'طردك جاهز للاستلام الآن من مكتب ياليدين في ولايتك',
      };
    }

    if (status.includes('centre') || status.includes('tri') || status.includes('localisation')) {
      return {
        statusRaw: 'at_local_hub',
        description: 'وصل الطرد إلى مركز التوزيع في ولايتك ويتم فرزه للتسليم',
      };
    }

    // 4. خروج المندوب للتوصيل إلى المنزل
    if (status.includes('sorti') || status.includes('en livraison') || status.includes('prêt pour livreur')) {
      return {
        statusRaw: 'out_for_delivery',
        description: 'مندوب ياليدين في طريقه إلى عنوانك اليوم للتسليم، يرجى إبقاء هاتفك متاحاً',
      };
    }

    // 5. 🚨 الحالات الحرجة: محاولات الاتصال الفاشلة والتنبيهات (لحماية التاجر من الـ Retour)
    if (status.includes('échoué') || status.includes('tentative') || status.includes('alerte')) {
      if (reason.includes('répond pas') || reason.includes('pas de réponse')) {
        return {
          statusRaw: 'attempt_failed_no_answer',
          description: 'تنبيه: حاول مندوب ياليدين الاتصال بك لتسليم الشحنة ولم يتم الرد! يرجى الانتباه لهاتفك لإعادة المحاولة ⚠️',
        };
      }
      if (reason.includes('injoignable') || reason.includes('fermé') || reason.includes('éteint')) {
        return {
          statusRaw: 'attempt_failed_unreachable',
          description: 'تنبيه: رقم هاتفك غير متاح لشبكة الاتصال! يرجى تشغيل الهاتف للتنسيق مع المندوب 📵',
        };
      }
      return {
        statusRaw: 'attempt_failed',
        description: 'تعذر تسليم الشحنة في هذه المحاولة، وسيتم التنسيق لإعادة محاولة التوصيل ⚠️',
      };
    }

    if (status.includes('reporté') || reason.includes('reporté')) {
      return {
        statusRaw: 'postponed',
        description: 'تم تأجيل موعد تسليم الشحنة بناءً على طلبك إلى موعد لاحق 🗓️',
      };
    }

    // 6. التسليم النهائي وقبض المبلغ
    if (status.includes('livré') || status.includes('encaissé') || status.includes('payé')) {
      return {
        statusRaw: 'delivered',
        description: 'تم تسليم الشحنة واستلام المبلغ نقداً بنجاح! شكراً لثقتكم بنا ✅',
      };
    }

    // 7. حالات الإرجاع (Retour)
    if (status.includes('retour') || status.includes('annulé') || status.includes('refusé')) {
      return {
        statusRaw: 'returned',
        description: 'فشلت محاولات التوصيل وجاري إرجاع الطرد إلى المتجر 🔄',
      };
    }

    // الحالة الافتراضية
    return {
      statusRaw: status,
      description: 'جاري متابعة وتحديث وضعية الشحنة مع ياليدين',
    };
  }
}