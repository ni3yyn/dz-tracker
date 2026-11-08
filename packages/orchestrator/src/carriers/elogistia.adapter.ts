import { normalizeAlgerianPhone, safeLower, normalizeDiacritics } from '../utils/safe';
import type { TrackingEvent } from '../index';

function first(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return '';
}

export function mapElogistiaStatus(status: unknown, log?: unknown): { statusRaw: string; statusTitle: string; description: string } {
  const raw = first(status, log);
  const normalized = normalizeDiacritics(safeLower(raw));
  if (!normalized) return { statusRaw: 'unknown', statusTitle: 'تحديث جديد من Elogistia', description: 'وصل سجل تتبع دون وصف حالة واضح.' };

  if (/retour|return/.test(normalized)) {
    const returned = /remis|livre|recu|vendeur|client/.test(normalized);
    return returned
      ? { statusRaw: 'returned', statusTitle: 'تم إرجاع الشحنة', description: 'أكدت Elogistia اكتمال إرجاع الشحنة.' }
      : { statusRaw: 'returning', statusTitle: 'الشحنة في مسار الإرجاع', description: 'بدأت Elogistia مسار إعادة الشحنة.' };
  }
  if (/annul|cancel|supprim/.test(normalized)) {
    return { statusRaw: 'cancelled', statusTitle: 'تم إلغاء الشحنة', description: 'سجلت Elogistia إلغاء الشحنة.' };
  }
  if (/livr[eé]|delivered/.test(normalized) && !/livreur|livraison/.test(normalized)) {
    return { statusRaw: 'delivered', statusTitle: 'تم تسليم الشحنة', description: 'أكدت Elogistia تسليم الشحنة.' };
  }
  if (/en cours livraison|sortie en livraison|en livraison|livreur|out for delivery/.test(normalized)) {
    return { statusRaw: 'out_for_delivery', statusTitle: 'خرجت الشحنة للتوصيل', description: 'الشحنة مع مندوب التوصيل لدى Elogistia.' };
  }
  if (/echec|tentative|suspendue|refus/.test(normalized)) {
    return { statusRaw: 'attempt_failed', statusTitle: 'تعذرت محاولة التوصيل', description: 'سجلت Elogistia محاولة توصيل غير ناجحة أو تعذراً في التسليم.' };
  }
  if (/ramassee|receptionnee|picked up/.test(normalized)) {
    return { statusRaw: 'dispatched', statusTitle: 'تم استلام الشحنة', description: 'سجلت Elogistia استلام الشحنة.' };
  }
  if (/a expedie/.test(normalized)) {
    return { statusRaw: 'processing', statusTitle: 'الشحنة تنتظر الإرسال', description: 'سجلت Elogistia الطلب بانتظار مرحلة الإرسال.' };
  }
  if (/transit|hub|expedi|dispatch|vers wilaya|en cours/.test(normalized)) {
    return { statusRaw: 'in_transit', statusTitle: 'الشحنة قيد النقل', description: 'تواصل الشحنة مسارها عبر شبكة Elogistia.' };
  }
  if (/attente|cree|nouveau|pending|a expedier|preparation/.test(normalized)) {
    return { statusRaw: 'processing', statusTitle: 'الشحنة قيد المعالجة', description: 'الشحنة مسجلة وتنتظر استكمال إجراءات Elogistia.' };
  }
  if (/perdue|lost/.test(normalized)) {
    return { statusRaw: 'attempt_failed', statusTitle: 'تحتاج الشحنة إلى متابعة', description: 'سجلت Elogistia حالة فقدان أو تعذر تتطلب متابعة.' };
  }
  return { statusRaw: 'unknown', statusTitle: 'تحديث جديد من Elogistia (' + raw + ')', description: 'وصلت حالة غير معروفة من Elogistia: ' + raw + '. لم يتم تخمين معناها.' };
}

export function parseElogistiaDate(value: unknown): string | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  // Elogistia is an Algerian courier; slash-formatted timestamps use Algeria local wall time (UTC+1).
  // Parse day/month explicitly before Date handles ambiguous slash dates as MM/DD.
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const iso = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + hour.padStart(2, '0') + ':' + minute + ':' + second + '+01:00';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export class ElogistiaAdapter {
  static normalize(merchantId: string, rawPayload: unknown): TrackingEvent {
    const root = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload) ? rawPayload as Record<string, any> : {};
    const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root;
    const status = first(data.Statut, data.statut, data.status, data.Status);
    const log = first(data.Log, data.log, data.description, data.comment);
    const mapped = mapElogistiaStatus(status, log);
    const tracking = first(data.tracking, data.Tracking, data.tracking_number, data.trackingNumber, data.tracking_code);
    const externalOrderId = first(data.IdCommande, data.id_commande, data.order_id, data.external_order_id, data.reference) || tracking;
    const occurredAt = parseElogistiaDate(data.Date ?? data.date ?? data.created_at ?? data.timestamp);
    const eventId = first(data.source_event_id, data.sourceEventId);
    const customerName = first(data.customer_name, data.client, data.name);
    const customerPhone = normalizeAlgerianPhone(first(data.phone, data.customer_phone)) || undefined;
    return {
      merchantId,
      externalOrderId: externalOrderId || 'ELOGISTIA-' + (tracking || 'UNKNOWN'),
      customerName: customerName || undefined,
      customerPhone,
      productName: first(data.product, data.product_name, data.product_description) || undefined,
      statusRaw: mapped.statusRaw,
      statusTitle: mapped.statusTitle,
      description: [mapped.description, log && log !== status ? log : ''].filter(Boolean).join(' — '),
      carrierName: 'Elogistia',
      carrierTrackingNumber: tracking || undefined,
      carrierOrderId: tracking || undefined,
      sourceProvider: 'elogistia',
      sourceOccurredAt: occurredAt,
      sourceEventId: eventId || undefined,
      sourceEventType: 'tracking_history',
      suppressTriggers: data.suppressTriggers === true,
      carrierMetadata: {
        elogistiaTrackingNumber: tracking || null,
        rawStatus: status || null,
        log: log || null,
        eventDate: occurredAt || first(data.Date, data.date) || null,
      },
    };
  }
}
