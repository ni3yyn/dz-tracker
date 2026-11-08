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
export function mapEcomV2Status(value: unknown): { statusRaw: string; statusTitle: string; description: string } {
  const raw = first(value);
  const key = normalizeDiacritics(safeLower(raw)).replace(/\s+/g, ' ').trim();
  if (NOTE_LABELS.has(key)) return { statusRaw: 'unknown', statusTitle: 'معلومة من E-com Delivery', description: 'سجلت الشركة معلومة إضافية دون تغيير واضح في حالة الشحنة.' };
  if (/commande annuler|supprimee|supprime/.test(key)) return { statusRaw: 'cancelled', statusTitle: 'تم إلغاء الشحنة', description: 'سجلت E-com Delivery إلغاء الشحنة.' };
  if (/annuler|retour de dispatche|retour navette|retour fournisseur|retour stock|retour/.test(key)) return { statusRaw: 'returned', statusTitle: 'الشحنة في مسار الإرجاع', description: 'سجلت E-com Delivery مرحلة من مراحل إرجاع الشحنة.' };
  if (/livree|encaisser|recouvert|recuperer|delivered/.test(key)) return { statusRaw: 'delivered', statusTitle: 'تم تسليم الشحنة', description: 'أكدت E-com Delivery تسليم الشحنة أو تحصيل مبلغها.' };
  if (/ne reponde|attente du client|report|appel tel|sms envoye|whatsapp ok|au bureau|en livraison|sortir en livraison|dispatcher/.test(key)) return { statusRaw: 'in_transit', statusTitle: 'الشحنة قيد التوصيل', description: 'تتابع الشحنة مسارها لدى E-com Delivery.' };
  if (/en traitement|commande confirmee/.test(key)) return { statusRaw: 'processing', statusTitle: 'تم تأكيد الشحنة', description: 'أكدت E-com Delivery الشحنة وبدأت معالجتها.' };
  if (/en preparation|attend confirmation/.test(key)) return { statusRaw: 'pending', statusTitle: 'الشحنة قيد التحضير', description: 'الشحنة مسجلة وتنتظر تأكيدها لدى E-com Delivery.' };
  return { statusRaw: 'unknown', statusTitle: 'تحديث جديد من E-com Delivery (' + raw + ')', description: 'وصلت حالة غير معروفة من E-com Delivery؛ لم يتم تخمين معناها.' };
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
