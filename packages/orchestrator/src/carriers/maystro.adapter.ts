import { TrackingEvent } from '../index';
import {
  safeString,
  safeLower,
  normalizeDiacritics,
  extractFirst,
  normalizeAlgerianPhone,
} from '../utils/safe';

/**
 * خريطة الولايات الـ 58 الرسمية في الجزائر لمطابقة معرّف ولاية Maystro Delivery (1-58)
 */
export const ALGERIA_WILAYAS_58: Record<number, string> = {
  1: 'أدرار (Adrar)',
  2: 'الشلف (Chlef)',
  3: 'الأغواط (Laghouat)',
  4: 'أم البواقي (Oum El Bouaghi)',
  5: 'باتنة (Batna)',
  6: 'بجاية (Béjaïa)',
  7: 'بسكرة (Biskra)',
  8: 'بشار (Béchar)',
  9: 'البليدة (Blida)',
  10: 'البويرة (Bouira)',
  11: 'تمنراست (Tamanrasset)',
  12: 'تبسة (Tébessa)',
  13: 'تلمسان (Tlemcen)',
  14: 'تيارت (Tiaret)',
  15: 'تيزي وزو (Tizi Ouzou)',
  16: 'الجزائر العاصمة (Alger)',
  17: 'الجلفة (Djelfa)',
  18: 'جيجل (Jijel)',
  19: 'سطيف (Sétif)',
  20: 'سعيدة (Saïda)',
  21: 'سكيكدة (Skikda)',
  22: 'سيدي بلعباس (Sidi Bel Abbès)',
  23: 'عنابة (Annaba)',
  24: 'قالمة (Guelma)',
  25: 'قسنطينة (Constantine)',
  26: 'المدية (Médéa)',
  27: 'مستغانم (Mostaganem)',
  28: 'المسيلة (M\'Sila)',
  29: 'معسكر (Mascara)',
  30: 'ورقلة (Ouargla)',
  31: 'وهران (Oran)',
  32: 'البيض (El Bayadh)',
  33: 'إليزي (Illizi)',
  34: 'برج بوعريريج (Bordj Bou Arréridj)',
  35: 'بومرداس (Boumerdès)',
  36: 'الطارف (El Tarf)',
  37: 'تندوف (Tindouf)',
  38: 'تيسمسيلت (Tissemsilt)',
  39: 'الوادي (El Oued)',
  40: 'خنشلة (Khenchela)',
  41: 'سوق أهراس (Souk Ahras)',
  42: 'تيبازة (Tipaza)',
  43: 'ميلة (Mila)',
  44: 'عين الدفلى (Aïn Defla)',
  45: 'النعامة (Naâma)',
  46: 'عين تموشنت (Aïn Témouchent)',
  47: 'غرداية (Ghardaïa)',
  48: 'غليزان (Relizane)',
  49: 'تيميمون (Timimoun)',
  50: 'برج باجي مختار (Bordj Badji Mokhtar)',
  51: 'أولاد جلال (Ouled Djellal)',
  52: 'بني عباس (Béni Abbès)',
  53: 'عين صالح (In Salah)',
  54: 'عين قزام (In Guezzam)',
  55: 'تقرت (Touggourt)',
  56: 'جانت (Djanet)',
  57: 'المغير (El M\'Ghair)',
  58: 'المنيعة (El Meniaa)',
};

/**
 * الولايات الـ 11 الجديدة المستحدثة في التقسيم الإداري 2026 (Loi n° 26-06)
 * تنبيه: شركات الشحن ترفض أي كود فوق 58 حتى انتهاء الفترة الانتقالية.
 * يتم استخدام shipAs لتحويل الكود للولاية الأم الصالحة للشحن.
 */
export const ALGERIA_NEW_WILAYAS_2026: Record<number, { name: string; shipAs: number }> = {
  59: { name: 'أفلو (Aflou)', shipAs: 3 },
  60: { name: 'بريكة (Barika)', shipAs: 5 },
  61: { name: 'القنطرة (El Kantara)', shipAs: 7 },
  62: { name: 'بئر العاتر (Bir El Ater)', shipAs: 12 },
  63: { name: 'العريشة (El Aricha)', shipAs: 13 },
  64: { name: 'قصر الشلالة (Ksar Chellala)', shipAs: 14 },
  65: { name: 'عين وسارة (Aïn Ouessara)', shipAs: 17 },
  66: { name: 'مسعد (Messaad)', shipAs: 17 },
  67: { name: 'قصر البخاري (Ksar El Boukhari)', shipAs: 26 },
  68: { name: 'بوسعادة (Bou Saâda)', shipAs: 28 },
  69: { name: 'الأبيض سيدي الشيخ (El Abiodh Sidi Cheikh)', shipAs: 32 },
};

/**
 * تحويل كود الولاية إلى كود متوافق مع شركات الشحن الجزائرية (1-58)
 */
export function resolveCourierWilayaCode(code: number): { courierCode: number; displayName: string } {
  if (code in ALGERIA_NEW_WILAYAS_2026) {
    const newWilaya = ALGERIA_NEW_WILAYAS_2026[code];
    return { courierCode: newWilaya.shipAs, displayName: newWilaya.name };
  }
  return { courierCode: code, displayName: ALGERIA_WILAYAS_58[code] || `ولاية ${code}` };
}

/**
 * محول شركة Maystro Delivery (maystro-delivery.com)
 * يدعم بنية Django REST Framework / backend.maystro-delivery.com/api/
 */
export class MaystroAdapter {
  /**
   * تحويل Payload الخاص بـ Maystro Delivery إلى صيغة TrackingEvent المعيارية
   */
  static normalize(merchantId: string, rawPayload: any): TrackingEvent {
    let payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

    // دعم الطرود الملتفة داخل { order: {...} } أو { data: {...} } أو مصفوفات
    if (payload.order && typeof payload.order === 'object') {
      payload = payload.order;
    } else if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      payload = payload.data;
    } else if (Array.isArray(payload) && payload.length > 0) {
      payload = payload[0];
    }

    // 1. استخراج رقم التتبع (Tracking Barcode / Code)
    const trackingNumber = extractFirst(payload, [
      'tracking_id',
      'tracking_number',
      'tracking',
      'barcode',
      'code_suivi',
      'id',
      'order_id',
    ]);

    // 2. استخراج رقم الطلب الخارجي (external_order_id في Maystro)
    const externalOrderId = extractFirst(
      payload,
      [
        'external_order_id',
        'external_id',
        'order_number',
        'order_id',
        'reference',
        'id',
      ],
      trackingNumber || 'MAYSTRO_ORDER'
    )!;

    // 3. استخراج بيانات العميل
    const customerName = extractFirst(payload, [
      'customer_name',
      'client_name',
      'client',
      'name',
      'destinataire',
      'nom',
    ]);

    // استخراج الهاتف وتطبيع الصيغة الجزائرية (+213)
    const rawPhone = extractFirst(payload, [
      'customer_phone',
      'phone',
      'telephone',
      'mobile',
      'tel',
      'client_phone',
    ]);
    const customerPhone = normalizeAlgerianPhone(rawPhone);

    // 4. استخراج اسم المنتج وقيمته
    let productName = extractFirst(payload, [
      'product_name',
      'product',
      'produit',
      'logistical_description',
    ]);

    // Maystro تمرر قائمة المنتجات أحياناً كمصفوفة products: [...]
    if (!productName && Array.isArray(payload.products) && payload.products.length > 0) {
      const firstProduct = payload.products[0];
      if (typeof firstProduct === 'string') {
        productName = firstProduct;
      } else if (firstProduct && typeof firstProduct === 'object') {
        productName = firstProduct.name || firstProduct.description || firstProduct.title;
      }
    }

    // 5. نوع التوصيل (delivery_type: 0 = Domicile, 1 = Point de retrait / Stopdesk)
    const rawDeliveryType = extractFirst(payload, ['delivery_type', 'type_livraison', 'type']);
    const isStopdesk =
      rawDeliveryType === '1' ||
      safeLower(rawDeliveryType).includes('point') ||
      safeLower(rawDeliveryType).includes('retrait') ||
      safeLower(rawDeliveryType).includes('stopdesk');

    // 6. استخراج الولاية والبلدية
    const rawWilaya = payload.wilaya;
    let wilayaName = '';
    if (typeof rawWilaya === 'number' && ALGERIA_WILAYAS_58[rawWilaya]) {
      wilayaName = ALGERIA_WILAYAS_58[rawWilaya];
    } else if (typeof rawWilaya === 'string') {
      const num = parseInt(rawWilaya, 10);
      if (!isNaN(num) && ALGERIA_WILAYAS_58[num]) {
        wilayaName = ALGERIA_WILAYAS_58[num];
      } else {
        wilayaName = rawWilaya;
      }
    }

    const rawCommune = extractFirst(payload, ['commune_name', 'commune', 'destination_text', 'address']);

    // 7. استخراج الحالة (status) والملاحظات (note_to_driver / reason)
    const rawStatus = extractFirst(
      payload,
      ['status', 'current_status', 'statut', 'etat', 'state', 'order_status'],
      'created'
    );

    const rawReason = extractFirst(
      payload,
      [
        'reason',
        'motif',
        'motif_retour',
        'sub_status',
        'note_to_driver',
        'note',
        'comment',
        'commentaire',
      ],
      ''
    );

    // تحليل دقيق لحالات Maystro Delivery
    const parsed = this.parseMaystroStatus(rawStatus!, rawReason!, wilayaName, rawCommune || '', isStopdesk);

    return {
      merchantId: safeString(merchantId),
      externalOrderId: safeString(externalOrderId),
      customerName: customerName ? safeString(customerName).trim() : undefined,
      customerPhone: customerPhone || undefined,
      productName: productName ? safeString(productName).trim() : undefined,
      statusRaw: parsed.statusRaw,
      description: parsed.description,
      carrierName: 'Maystro Delivery',
      carrierTrackingNumber: trackingNumber || undefined,
    };
  }

  /**
   * القاموس المتخصص لمطابقة حالات Maystro Delivery
   */
  private static parseMaystroStatus(
    statusRaw: string,
    reasonRaw: string,
    wilayaName: string,
    commune: string,
    isStopdesk: boolean
  ): { statusRaw: string; description: string } {
    const status = normalizeDiacritics(safeLower(statusRaw));
    const reason = normalizeDiacritics(safeLower(reasonRaw));

    const locationText = wilayaName ? ` ${wilayaName}` : '';

    // 1. الإنشاء والتسجيل في النظام (Created / Starter / Draft)
    if (
      status.includes('cree') ||
      status.includes('created') ||
      status.includes('draft') ||
      status.includes('starter') ||
      status.includes('preparation') ||
      status.includes('pending')
    ) {
      return {
        statusRaw: 'processing',
        description: 'تم تسجيل الطلب في نظام Maystro Delivery وجاري تحضيره للتسليم للناقل 📦',
      };
    }

    // 2. الاستلام من المتجر (Picked up / Ramassé / Reçu)
    if (
      status.includes('ramasse') ||
      status.includes('picked') ||
      status.includes('pickup') ||
      status.includes('collecte') ||
      status.includes('recu') ||
      status.includes('hub_depart')
    ) {
      return {
        statusRaw: 'dispatched',
        description: 'استلم مندوب Maystro Delivery الطرد وهو في طريقه إلى مركز الفرز 🚚',
      };
    }

    // 3. النقل والعبور بين الولايات (In Transit / En transit / Transfert)
    if (
      status.includes('transit') ||
      status.includes('transfer') ||
      status.includes('vers') ||
      status.includes('ligne') ||
      status.includes('shipped')
    ) {
      return {
        statusRaw: 'in_transit',
        description: locationText
          ? `طردك في شاحنة النقل السريع متوجهاً نحو مركز ولاية${locationText} 🚛`
          : 'الشحنة في طريقها بين الولايات عبر شبكة النقل السريع 🚛',
      };
    }

    // 4. نقطة الاستلام / Stopdesk (Point de retrait / Au bureau)
    if (
      status.includes('point_de_retrait') ||
      status.includes('retrait') ||
      status.includes('bureau') ||
      status.includes('stopdesk') ||
      status.includes('agence') ||
      (isStopdesk && (status.includes('hub') || status.includes('disponible') || status.includes('arrive')))
    ) {
      return {
        statusRaw: 'ready_for_pickup',
        description: `طردك متوفر وجاهز للاستلام الآن من نقطة استلام Maystro Delivery${locationText} 🏢`,
      };
    }

    // 5. مركز التوزيع المحلي (Hub / Centre de tri)
    if (
      status.includes('hub') ||
      status.includes('centre') ||
      status.includes('arrive') ||
      status.includes('reception')
    ) {
      return {
        statusRaw: 'at_local_hub',
        description: `وصل الطرد إلى مركز التوزيع المحلي لـ Maystro Delivery${locationText} وجاري الفرز 🏢`,
      };
    }

    // 6. خروج المندوب للتوصيل (Out for delivery / En cours de livraison / Dispatch)
    if (
      status.includes('cours') ||
      status.includes('delivery') ||
      status.includes('distrib') ||
      status.includes('livreur') ||
      status.includes('dispatch') ||
      status.includes('sortie')
    ) {
      return {
        statusRaw: 'out_for_delivery',
        description: 'المندوب في طريقه إليك لتسليم الطرد اليوم، يرجى إبقاء هاتفك مفتوحاً 🛵',
      };
    }

    // 7. تم التوصيل بنجاح (Delivered / Livré)
    if (
      status.includes('livre') ||
      status.includes('delivered') ||
      status.includes('completed') ||
      status.includes('paye') ||
      status.includes('encaisse')
    ) {
      return {
        statusRaw: 'delivered',
        description: 'تم تسليم الطرد بنجاح وتحصيل المبلغ، شكراً لثقتكم بنا! 🎉',
      };
    }

    // 8. فشل محاولة التوصيل بسبب عدم الرد أو الغياب (COD Return Risk Trigger)
    if (
      status.includes('repond') ||
      status.includes('injoignable') ||
      status.includes('absent') ||
      status.includes('unreachable') ||
      status.includes('no_answer') ||
      status.includes('failed') ||
      status.includes('echec') ||
      reason.includes('repond') ||
      reason.includes('injoignable') ||
      reason.includes('absent') ||
      reason.includes('eteint') ||
      reason.includes('occupe') ||
      reason.includes('faux numero')
    ) {
      return {
        statusRaw: 'attempt_failed_no_answer',
        description: 'تعذر التوصيل: الزبون لا يرد على الهاتف أو الرقم مغلق، يرجى التواصل لتأكيد الموعد ⚠️',
      };
    }

    // 9. تأجيل الموعد بطلب الزبون (Postponed / Reporté)
    if (
      status.includes('report') ||
      status.includes('postpone') ||
      status.includes('retarde') ||
      reason.includes('report') ||
      reason.includes('demain')
    ) {
      return {
        statusRaw: 'postponed',
        description: 'تم تأجيل موعد التسليم بطلب من الزبون إلى وقت لاحق ⏳',
      };
    }

    // 10. إرجاع الطرد (Returned / Retour / Annulé)
    if (
      status.includes('retour') ||
      status.includes('returned') ||
      status.includes('annul') ||
      status.includes('cancel') ||
      status.includes('refus') ||
      reason.includes('refus') ||
      reason.includes('annul')
    ) {
      return {
        statusRaw: 'returned',
        description: 'تم إلغاء الطلب وهو في طريق الإرجاع إلى مستودع المتجر ↩️',
      };
    }

    // الحالة الافتراضية
    return {
      statusRaw: safeLower(statusRaw) || 'in_transit',
      description: `حالة الشحنة الحالية لدى Maystro Delivery: ${statusRaw}`,
    };
  }
}
