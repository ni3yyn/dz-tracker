import { TrackingEvent } from '../index';
import {
  safeString,
  safeLower,
  normalizeDiacritics,
  extractFirst,
  normalizeAlgerianPhone,
} from '../utils/safe';

/**
 * محول شركة ZR Express المعتمدة على محرك Procolis API (procolis.com/api_v1)
 * يدعم كلاً من صيغة الحزمة الفردية وصيغة الحزم المتعددة { Colis: [...] }
 */
export class ZRExpressAdapter {
  /**
   * تحويل Payload الخاص بـ ZR Express / Procolis إلى صيغة TrackingEvent المعيارية
   */
  static normalize(merchantId: string, rawPayload: any): TrackingEvent {
    let payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

    // إذا كان الـ payload بصيغة مصفوفة طرود Procolis { Colis: [...] } نأخذ العنصر المعني أو الأول
    if (Array.isArray(payload.Colis) && payload.Colis.length > 0) {
      payload = payload.Colis[0];
    } else if (Array.isArray(payload) && payload.length > 0) {
      payload = payload[0];
    }

    // 1. استخراج رقم التتبع (Tracking Barcode)
    const trackingNumber = extractFirst(payload, [
      'Tracking',
      'tracking',
      'tracking_number',
      'id_colis',
      'code_suivi',
      'barcode',
      'id',
    ]);

    // 2. استخراج رقم الطلب الخارجي (id_Externe في Procolis)
    const externalOrderId = extractFirst(
      payload,
      [
        'id_Externe',
        'id_externe',
        'idExterne',
        'order_id',
        'external_order_id',
        'order_number',
        'reference',
      ],
      trackingNumber || 'ZR_ORDER'
    )!;

    // 3. استخراج بيانات العميل (Client) ورقم الهاتف (MobileA و MobileB في Procolis)
    const customerName = extractFirst(payload, [
      'Client',
      'client',
      'customer_name',
      'nom',
      'destinataire',
      'nom_client',
    ]);

    // محاولة قراءة الهاتف الأساسي MobileA ثم الثانوي MobileB
    const rawMobileA = extractFirst(payload, ['MobileA', 'mobileA', 'mobile_a', 'phone', 'telephone', 'tel']);
    const rawMobileB = extractFirst(payload, ['MobileB', 'mobileB', 'mobile_b', 'tel2', 'phone2']);
    const customerPhone = normalizeAlgerianPhone(rawMobileA) || normalizeAlgerianPhone(rawMobileB);

    // 4. استخراج اسم المنتج (TProduit في Procolis)
    const productName = extractFirst(payload, [
      'TProduit',
      'tProduit',
      't_produit',
      'product_name',
      'product',
      'produit',
      'article',
    ]);

    // 5. استخراج الحالة (Situation في Procolis) والمبرر (Motif)
    const rawSituation = extractFirst(payload, [
      'Situation',
      'situation',
      'Situation_Colis',
      'status',
      'statut',
      'etat',
      'last_status',
    ], 'Cree');

    const rawMotif = extractFirst(payload, [
      'Motif',
      'motif',
      'motif_retour',
      'reason',
      'Note',
      'note',
      'commentaire',
    ], '');

    const typeLivraison = extractFirst(payload, ['TypeLivraison', 'type_livraison', 'typeLivraison']);
    const isStopdesk = typeLivraison === '1' || String(typeLivraison).toLowerCase() === 'stopdesk';

    // تحليل دقيق لحالات Procolis
    const parsed = this.parseZRExpressStatus(rawSituation!, rawMotif!, payload, isStopdesk);

    return {
      merchantId: safeString(merchantId),
      externalOrderId: safeString(externalOrderId),
      customerName: customerName ? safeString(customerName).trim() : undefined,
      customerPhone: customerPhone || undefined,
      productName: productName ? safeString(productName).trim() : undefined,
      statusRaw: parsed.statusRaw,
      description: parsed.description,
      carrierName: 'ZR Express',
      carrierTrackingNumber: trackingNumber || undefined,
    };
  }

  /**
   * القاموس المتخصص لمطابقة حالات Procolis / ZR Express
   */
  private static parseZRExpressStatus(
    situationRaw: string,
    motifRaw: string,
    payload: any,
    isStopdesk: boolean
  ): { statusRaw: string; description: string } {
    const situation = normalizeDiacritics(safeLower(situationRaw));
    const motif = normalizeDiacritics(safeLower(motifRaw));

    const wilaya = extractFirst(payload, ['IDWilaya', 'wilaya', 'wilaya_name', 'destination']) || '';
    const commune = extractFirst(payload, ['Commune', 'commune']) || '';

    // 1. حالات الإنشاء والتجهيز (Prêt à expédier / Créé)
    if (
      situation.includes('cree') ||
      situation.includes('pret') ||
      situation.includes('attente') ||
      situation.includes('en preparation') ||
      situation === 'draft'
    ) {
      return {
        statusRaw: 'processing',
        description: 'تم تسجيل الشحنة بنظام ZR Express وجاري تجهيزها للاستلام من المتجر 📦',
      };
    }

    // 2. الاستلام من المتجر (Ramassé / Reçu au centre)
    if (
      situation.includes('ramasse') ||
      situation.includes('recu') ||
      situation.includes('reception') ||
      situation.includes('collecte')
    ) {
      return {
        statusRaw: 'dispatched',
        description: 'استلم مندوب ZR Express الطرد وهو في طريقه إلى المركز اللوجستي 🚚',
      };
    }

    // 3. النقل والعبور بين الولايات (En transit / Vers Wilaya)
    if (
      situation.includes('transit') ||
      situation.includes('transfert') ||
      situation.includes('vers') ||
      situation.includes('ligne')
    ) {
      return {
        statusRaw: 'in_transit',
        description: wilaya
          ? `طردك في شاحنة النقل السريع متوجهاً نحو مركز ولاية ${wilaya} 🚛`
          : 'الشحنة في طريقها بين الولايات عبر شبكة النقل السريع 🚛',
      };
    }

    // 4. مكاتب الاستلام (Stopdesk / Au Bureau)
    if (
      situation.includes('bureau') ||
      situation.includes('stopdesk') ||
      situation.includes('agence') ||
      situation.includes('disponible') ||
      (isStopdesk && (situation.includes('centre') || situation.includes('arrive')))
    ) {
      const locationText = commune || wilaya ? `(${[commune, wilaya].filter(Boolean).join(' - ')})` : '';
      return {
        statusRaw: 'ready_for_pickup',
        description: `طردك جاهز للاستلام الآن من مكتب ZR Express ${locationText} 🏢`,
      };
    }

    // 5. مركز التوزيع المحلي والفرز
    if (
      situation.includes('centre') ||
      situation.includes('hub') ||
      situation.includes('tri') ||
      situation.includes('arrive')
    ) {
      return {
        statusRaw: 'at_local_hub',
        description: 'وصل الطرد إلى مركز توزيع ZR Express ويتم فرزه للتسليم 📍',
      };
    }

    // 6. 🚨 الحالات الحرجة ومحاولات الاتصال الفاشلة (رادار مخاطر الـ COD - يجب فحصها قبل كلمة livraison)
    if (
      situation.includes('echoue') ||
      situation.includes('tentative') ||
      situation.includes('echec') ||
      situation.includes('alerte') ||
      situation.includes('probleme') ||
      motif.includes('repond pas') ||
      motif.includes('injoignable') ||
      motif.includes('absent')
    ) {
      // الزبون لا يرد على الهاتف
      if (
        motif.includes('repond pas') ||
        motif.includes('pas de reponse') ||
        motif.includes('sans reponse') ||
        motif.includes('occupe') ||
        motif.includes('absent')
      ) {
        return {
          statusRaw: 'attempt_failed_no_answer',
          description: 'تنبيه: حاول مندوب ZR Express الاتصال بك لتسليم الشحنة ولم يتم الرد! يرجى الانتباه لهاتفك ⚠️',
        };
      }

      // الهاتف مغلق أو الرقم غير صحيح
      if (
        motif.includes('injoignable') ||
        motif.includes('ferme') ||
        motif.includes('eteint') ||
        motif.includes('hors zone') ||
        motif.includes('faux numero') ||
        motif.includes('errone')
      ) {
        return {
          statusRaw: 'attempt_failed_unreachable',
          description: 'تنبيه: رقم الهاتف غير متاح لشبكة الاتصال حالياً! يرجى تشغيل الهاتف للتنسيق مع المندوب 📵',
        };
      }

      // الزبون طلب التأجيل
      if (motif.includes('reporte') || motif.includes('report') || motif.includes('demande client')) {
        return {
          statusRaw: 'postponed',
          description: 'تم تأجيل موعد تسليم الشحنة بناءً على رغبة الزبون لموعد لاحق 🗓️',
        };
      }

      // الزبون رفض الشحنة أو ألغى الطلب
      if (motif.includes('refuse') || motif.includes('annule') || motif.includes('pas commande')) {
        return {
          statusRaw: 'returned',
          description: 'تم رفض الشحنة أو إلغاؤها وجاري إرجاع الطرد إلى المتجر 🔄',
        };
      }

      return {
        statusRaw: 'attempt_failed',
        description: 'تعذر تسليم الشحنة في هذه المحاولة وسيتم التنسيق لإعادة التوصيل ⚠️',
      };
    }

    // 7. خروج المندوب للتوصيل
    if (
      situation.includes('sorti') ||
      situation.includes('livreur') ||
      situation.includes('cours de distribution') ||
      situation.includes('en livraison') ||
      (situation.includes('livraison') && !situation.includes('echec') && !situation.includes('non'))
    ) {
      return {
        statusRaw: 'out_for_delivery',
        description: 'مندوب ZR Express في طريقه إليك اليوم للتسليم، يرجى إبقاء هاتفك متاحاً 🛵',
      };
    }

    if (situation.includes('reporte')) {
      return {
        statusRaw: 'postponed',
        description: 'تم تأجيل موعد تسليم الشحنة بناءً على رغبة الزبون لموعد لاحق 🗓️',
      };
    }

    // 8. التسليم النهائي وقبض المبلغ
    if (
      situation.includes('livre') ||
      situation.includes('solde') ||
      situation.includes('encaisse') ||
      situation.includes('paye')
    ) {
      return {
        statusRaw: 'delivered',
        description: 'تم تسليم الشحنة وقبض المبلغ نقداً بنجاح! شكراً لثقتكم بنا ✅',
      };
    }

    // 9. الإرجاع النهائي (Retour)
    if (
      situation.includes('retour') ||
      situation.includes('refuse') ||
      situation.includes('annule')
    ) {
      return {
        statusRaw: 'returned',
        description: 'تعذر تسليم الشحنة وجاري إرجاع الطرد إلى مستودع المتجر 🔄',
      };
    }

    return {
      statusRaw: situationRaw ? safeLower(situationRaw) : 'processing',
      description: 'جاري متابعة وتحديث وضعية الشحنة مع ZR Express',
    };
  }
}

// تصدير مسمى بديل ProcolisAdapter لدعم كل الشركات المعتمدة على Procolis API
export const ProcolisAdapter = ZRExpressAdapter;
