import { createHash } from 'node:crypto';
import { normalizeAlgerianPhone, safeLower, normalizeDiacritics } from '../utils/safe';
import type { TrackingEvent } from '../index';

function first(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return '';
}

const NOTE_LABELS = new Set(['', 'encours', 'biz', 'suivi par e-com', 'information', 'type de colis', 'type de livraison']);
const STATUS_MAP: Record<string, { statusRaw: string; statusTitle: string; description: string }> = {
  'en preparation': { statusRaw: 'pending', statusTitle: 'الشحنة قيد التحضير', description: 'الشحنة مسجلة وتنتظر تأكيدها لدى E-com Delivery.' },
  'attend confirmation': { statusRaw: 'pending', statusTitle: 'بانتظار تأكيد الشحنة', description: 'تنتظر الشحنة تأكيدها لدى E-com Delivery.' },
  'commande reporte': { statusRaw: 'pending', statusTitle: 'تم تأجيل تأكيد الطلب', description: 'سجلت E-com Delivery تأجيل تأكيد الطلب.' },
  'commande a relance': { statusRaw: 'pending', statusTitle: 'الطلب بحاجة إلى إعادة الاتصال', description: 'سجلت E-com Delivery إعادة محاولة التواصل مع العميل.' },
  'en traitement': { statusRaw: 'processing', statusTitle: 'الشحنة قيد المعالجة', description: 'بدأت E-com Delivery معالجة الشحنة.' },
  'commande confirmee': { statusRaw: 'processing', statusTitle: 'تم تأكيد الشحنة', description: 'أكدت E-com Delivery الشحنة.' },
  'au bureau': { statusRaw: 'in_transit', statusTitle: 'وصلت الشحنة إلى المكتب', description: 'وصلت الشحنة إلى أحد مكاتب E-com Delivery.' },
  'en livraison': { statusRaw: 'in_transit', statusTitle: 'الشحنة قيد التوصيل', description: 'تتابع الشحنة مسارها لدى E-com Delivery.' },
  'sortir en livraison': { statusRaw: 'in_transit', statusTitle: 'خرجت الشحنة للتوصيل', description: 'سجلت E-com Delivery خروج الشحنة للتوصيل.' },
  'dispatcher': { statusRaw: 'in_transit', statusTitle: 'تم توجيه الشحنة', description: 'تم توجيه الشحنة ضمن شبكة E-com Delivery.' },
  'ne reponde pas #1': { statusRaw: 'in_transit', statusTitle: 'تعذر الاتصال بالعميل', description: 'سجلت E-com Delivery تعذر الاتصال بالعميل للمرة الأولى.' },
  'ne reponde pas #2': { statusRaw: 'in_transit', statusTitle: 'تعذر الاتصال بالعميل', description: 'سجلت E-com Delivery تعذر الاتصال بالعميل للمرة الثانية.' },
  'ne reponde pas #3': { statusRaw: 'in_transit', statusTitle: 'تعذر الاتصال بالعميل', description: 'سجلت E-com Delivery تعذر الاتصال بالعميل للمرة الثالثة.' },
  'en attente du client': { statusRaw: 'in_transit', statusTitle: 'بانتظار رد العميل', description: 'تنتظر E-com Delivery رد العميل لمتابعة التسليم.' },
  'reporte': { statusRaw: 'in_transit', statusTitle: 'تم تأجيل التوصيل', description: 'سجلت E-com Delivery تأجيل محاولة التوصيل.' },
  'reporte commune erronee': { statusRaw: 'in_transit', statusTitle: 'مراجعة البلدية', description: 'سجلت E-com Delivery تأجيلاً بسبب بيانات البلدية.' },
  'reporte wilaya erronee': { statusRaw: 'in_transit', statusTitle: 'مراجعة الولاية', description: 'سجلت E-com Delivery تأجيلاً بسبب بيانات الولاية.' },
  'appel tel': { statusRaw: 'in_transit', statusTitle: 'تم الاتصال بالعميل', description: 'سجلت E-com Delivery محاولة اتصال بالعميل.' },
  'sms envoye': { statusRaw: 'in_transit', statusTitle: 'تم إرسال رسالة للعميل', description: 'سجلت E-com Delivery إرسال رسالة نصية للعميل.' },
  'whatsapp ok': { statusRaw: 'in_transit', statusTitle: 'تم التواصل عبر واتساب', description: 'سجلت E-com Delivery التواصل مع العميل عبر واتساب.' },
  'livree': { statusRaw: 'delivered', statusTitle: 'تم تسليم الشحنة', description: 'أكدت E-com Delivery تسليم الشحنة.' },
  'encaisser': { statusRaw: 'delivered', statusTitle: 'تم تحصيل المبلغ', description: 'سجلت E-com Delivery تحصيل مبلغ الشحنة.' },
  'recouvert': { statusRaw: 'delivered', statusTitle: 'تم تحصيل المبلغ', description: 'سجلت E-com Delivery تحصيل مبلغ الشحنة.' },
  'recuperer': { statusRaw: 'delivered', statusTitle: 'تم استرجاع المبلغ', description: 'سجلت E-com Delivery استرجاع المبلغ.' },
  'retour fournisseur': { statusRaw: 'returned', statusTitle: 'أُعيدت الشحنة إلى المرسل', description: 'سجلت E-com Delivery إرجاع الشحنة إلى المرسل.' },
  'retour stock': { statusRaw: 'returned', statusTitle: 'عادت الشحنة إلى المخزون', description: 'سجلت E-com Delivery إعادة الشحنة إلى المخزون.' },
  'annuler': { statusRaw: 'returned', statusTitle: 'الشحنة في مسار الإرجاع', description: 'سجلت E-com Delivery حالة إلغاء/إرجاع.' },
  'annuler x3': { statusRaw: 'returned', statusTitle: 'الشحنة في مسار الإرجاع', description: 'سجلت E-com Delivery حالة إلغاء/إرجاع متكررة.' },
  'retour de dispatche': { statusRaw: 'returned', statusTitle: 'عادت الشحنة من التوزيع', description: 'سجلت E-com Delivery عودة الشحنة من التوزيع.' },
  'retour navette': { statusRaw: 'returned', statusTitle: 'عادت الشحنة عبر النقل', description: 'سجلت E-com Delivery عودة الشحنة عبر النقل.' },
  'commande annuler': { statusRaw: 'cancelled', statusTitle: 'تم إلغاء الشحنة', description: 'سجلت E-com Delivery إلغاء الطلب.' },
  'supprimee': { statusRaw: 'cancelled', statusTitle: 'تم حذف الشحنة', description: 'سجلت E-com Delivery حذف الشحنة.' },
};
export function mapEcomV2Status(value: unknown): { statusRaw: string; statusTitle: string; description: string } {
  const raw = first(value);
  const key = normalizeDiacritics(safeLower(raw)).replace(/\\s+/g, ' ').trim();
  if (NOTE_LABELS.has(key)) return { statusRaw: 'unknown', statusTitle: 'معلومة من E-com Delivery', description: 'سجلت الشركة معلومة إضافية دون تغيير واضح في حالة الشحنة.' };
  return STATUS_MAP[key] || {
    statusRaw: 'unknown',
    statusTitle: 'تحديث جديد من E-com Delivery (' + raw + ')',
    description: 'وصلت حالة غير معروفة من E-com Delivery؛ لم يتم تخمين معناها.',
  };
}

export function parseEcomV2Date(value: unknown): string | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, y, m, d, h='00', min='00', s='00'] = match;
    const date = new Date(y+'-'+m+'-'+d+'T'+h+':'+min+':'+s+'+01:00');
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function ecomV2EventId(tracking: string, event: Record<string, any>): string {
  return createHash('sha256').update([tracking,event.date,event.situation,event.commentaire,event.etat_logistique].map(first).join('|')).digest('hex');
}

export class EcomV2Adapter {
  static normalize(merchantId: string, rawPayload: unknown): TrackingEvent {
    const root = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, any> : {};
    const data = root.data && typeof root.data === 'object' ? root.data : root;
    const situation = first(data.situation, data.Situation, data.etat_logistique, data.status);
    const comment = first(data.commentaire, data.comment, data.description);
    const mapped = mapEcomV2Status(situation);
    const tracking = first(data.tracking, data.tracking_number, data.code_suivi, data.id);
    const externalOrderId = first(data.id_externe, data.external_order_id, data.order_id) || tracking;
    const occurredAt = parseEcomV2Date(data.date ?? data.created_at ?? data.timestamp);
    return {
      merchantId,
      externalOrderId: externalOrderId || 'ECOMV2-' + (tracking || 'UNKNOWN'),
      customerName: first(data.nom_complet, data.customer_name, data.name) || undefined,
      customerPhone: normalizeAlgerianPhone(first(data.mobile_1, data.phone, data.customer_phone)) || undefined,
      productName: first(data.article, data.product_name, data.product) || undefined,
      statusRaw: mapped.statusRaw,
      statusTitle: mapped.statusTitle,
      description: [mapped.description, comment].filter(Boolean).join(' — '),
      carrierName: 'E-com Delivery v2',
      carrierTrackingNumber: tracking || undefined,
      sourceProvider: 'ecom_v2',
      sourceOccurredAt: occurredAt,
      sourceEventId: first(data.source_event_id, data.sourceEventId) || undefined,
      sourceEventType: 'tracking_history',
      suppressTriggers: data.suppressTriggers === true,
      carrierMetadata: {
        ecomV2TrackingNumber: tracking || null,
        rawSituation: situation || null,
        logisticsState: first(data.etat_logistique) || null,
        comment: comment || null,
        eventDate: occurredAt || first(data.date) || null,
      },
    };
  }
}
