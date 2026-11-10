import { createHash } from 'node:crypto';
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


export type MaystroWebhookEnvelope = {
  eventType: string;
  payload: Record<string, any>;
  orderId: string | null;
  isTest: boolean;
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return undefined;
}

function decodeMaystroData(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return record(value);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Maystro webhook did not contain an event dictionary.');
  }

  let text = value.trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'string') {
        text = parsed.trim();
        continue;
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return record(parsed);
      }
    } catch {
      // Maystro documents Base64 data; try decoding the current layer.
    }

    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (!decoded || decoded === text) break;
    text = decoded;
  }

  throw new Error('Maystro webhook data could not be decoded as JSON (Base64 layers exhausted).');
}

/**
 * Maystro currently documents a Base64 event inside message.data. Some examples
 * decode once and the prose describes two layers, so accept either form while
 * still requiring the decoded value to be a JSON object.
 */
export function parseMaystroWebhookEnvelope(rawBody: string): MaystroWebhookEnvelope {
  let outer: Record<string, any>;
  try {
    outer = record(JSON.parse(rawBody));
  } catch {
    throw new Error('Maystro webhook body is not valid JSON.');
  }

  const message = record(outer.message);
  const candidate =
    message.data ??
    outer.data ??
    outer.payload ??
    outer.eventData ??
    outer;

  const decoded = decodeMaystroData(candidate);
  const eventType = firstText(
    decoded.event,
    decoded.event_type,
    decoded.eventType,
    decoded.type,
    decoded.name,
    record(outer.message).event,
    record(outer.message).event_type,
    record(outer.message).eventType,
    record(outer.message).event_name,
    record(outer.message).type,
    outer.event_name,
    outer.event,
    outer.event_type,
    outer.eventType,
    outer.type
  ) || '';

  const payload = record(
    decoded.payload ??
    decoded.order ??
    decoded.data ??
    (Object.keys(decoded).length ? decoded : outer.payload)
  );

  const nestedOrder = record(payload.order);
  const nestedData = record(payload.data);
  const orderId = firstText(
    payload.id,
    payload.order_id,
    payload.orderId,
    payload.uuid,
    nestedOrder.id,
    nestedOrder.order_id,
    nestedData.id,
    nestedData.order_id
  ) || null;

  return {
    eventType,
    payload,
    orderId,
    isTest: eventType.toLowerCase() === 'test' || /test/i.test(eventType),
  };
}

const MAYSTRO_STATUS_CODES: Record<string, { statusRaw: string; statusTitle: string; description: string }> = {
  '4': { statusRaw: 'processing', statusTitle: 'تم تسجيل الطلب لدى Maystro', description: 'تم تسجيل الطرد في نظام Maystro Delivery.' },
  '11': { statusRaw: 'processing', statusTitle: 'الطلب قيد الانتظار', description: 'الطلب مسجل لدى Maystro وينتظر بدء التجهيز.' },
  '12': { statusRaw: 'processing', statusTitle: 'المنتج غير متوفر مؤقتاً', description: 'أبلغت Maystro عن عدم توفر المنتج مؤقتاً.' },
  '5': { statusRaw: 'dispatched', statusTitle: 'تم طلب استلام الشحنة', description: 'تم إرسال طلب استلام الطرد من المتجر.' },
  '6': { statusRaw: 'processing', statusTitle: 'الشحنة قيد المعالجة', description: 'تقوم Maystro بتجهيز الشحنة ومعالجتها.' },
  '8': { statusRaw: 'in_transit', statusTitle: 'الشحنة بانتظار النقل', description: 'وصلت الشحنة إلى مركز Maystro وتنتظر النقل.' },
  '9': { statusRaw: 'in_transit', statusTitle: 'الشحنة في مرحلة النقل', description: 'تم تجهيز الشحنة لإرسالها إلى وجهتها.' },
  '15': { statusRaw: 'in_transit', statusTitle: 'تم تجهيز الشحنة للإرسال', description: 'أصبحت الشحنة جاهزة للخروج مع شبكة التوصيل.' },
  '22': { statusRaw: 'in_transit', statusTitle: 'تم تعيين مندوب للشحنة', description: 'تم تعيين مندوب لمتابعة توصيل الشحنة.' },
  '31': { statusRaw: 'in_transit', statusTitle: 'تم شحن الطرد', description: 'غادرت الشحنة مرحلة التجهيز وهي في طريقها إلى وجهتها.' },
  '32': { statusRaw: 'attempt_failed', statusTitle: 'يوجد تنبيه على الشحنة', description: 'سجلت Maystro تنبيهاً أو مشكلة تتعلق بمحاولة التوصيل.' },
  '42': { statusRaw: 'postponed', statusTitle: 'تم تأجيل التسليم', description: 'تم تأجيل موعد تسليم الشحنة.' },
  '41': { statusRaw: 'delivered', statusTitle: 'تم تسليم الطلب بنجاح', description: 'أكدت Maystro تسليم الشحنة.' },
  '50': { statusRaw: 'cancelled', statusTitle: 'تم إلغاء الطلب', description: 'تم إلغاء الطلب لدى Maystro.' },
  '10': { statusRaw: 'returned', statusTitle: 'بدأت عملية إرجاع الشحنة', description: 'الشحنة في طريق العودة إلى المتجر.' },
  '51': { statusRaw: 'returned', statusTitle: 'الشحنة جاهزة للإرجاع', description: 'أصبحت الشحنة جاهزة لإعادتها إلى المتجر.' },
  '52': { statusRaw: 'returned', statusTitle: 'استلم المتجر الشحنة المرتجعة', description: 'تم تسليم الشحنة المرتجعة إلى المتجر.' },
  '53': { statusRaw: 'returned', statusTitle: 'تم تسجيل عدم استلام المرتجع', description: 'سجلت Maystro أن المتجر لم يستلم الشحنة المرتجعة.' },
};

const MAYSTRO_STATUS_NAMES: Record<string, string> = {
  CREATED: '4',
  PENDING: '11',
  OUT_OF_STOCK: '12',
  PICK_UP_REQUESTED: '5',
  IN_PROCESS: '6',
  WAITING_TRANSIT: '8',
  IN_TRANSIT_TO_BE_SHIPPED: '9',
  READY_TO_SHIP: '15',
  ASSIGNED: '22',
  SHIPPED: '31',
  ALERTED: '32',
  POSTPONED: '42',
  DELIVERED: '41',
  ABORTED: '50',
  CANCELLED: '50',
  CANCELED: '50',
  IN_TRANSIT_TO_BE_RETURNED: '10',
  READY_TO_RETURN: '51',
  READY_TO_BE_RETURNED: '51',
  TAKEN_BY_STORE: '52',
  NOT_RECEIVED: '53',
};

export function mapMaystroStatus(value: unknown): { statusRaw: string; statusTitle: string; description: string } {
  const original = firstText(value) || '';
  const normalized = normalizeDiacritics(safeLower(original)).replace(/[\s-]+/g, '_');
  const code = /^\d+$/.test(original)
    ? original
    : MAYSTRO_STATUS_NAMES[normalized.toUpperCase()] || MAYSTRO_STATUS_NAMES[normalized.replace(/_/g, ' ').toUpperCase()];

  if (code && MAYSTRO_STATUS_CODES[code]) {
    return { ...MAYSTRO_STATUS_CODES[code] };
  }

  // Legacy webhook compatibility: earlier Maystro integrations sent French or
  // human-readable status strings instead of the documented numeric API codes.
  const status = normalized;
  const legacy: { statusRaw: string; statusTitle: string; description: string } | null =
    /^(ramasse|picked|picked_up|pickup|collecte|recu|hub_depart)/.test(status)
      ? { statusRaw: 'dispatched', statusTitle: 'تم استلام الشحنة من المتجر', description: 'استلم مندوب Maystro Delivery الطرد.' }
      : /(point_de_retrait|retrait|bureau|stopdesk|agence|ready_for_pickup|pickup_point)/.test(status)
        ? { statusRaw: 'ready_for_pickup', statusTitle: 'الشحنة جاهزة للاستلام', description: 'أصبح الطرد متاحاً للاستلام من نقطة Maystro.' }
        : /(out_for_delivery|en_livraison|livreur|distrib|dispatch|sortie)/.test(status)
          ? { statusRaw: 'out_for_delivery', statusTitle: 'خرجت الشحنة للتوصيل', description: 'الشحنة مع مندوب التوصيل.' }
          : /(hub|centre|arrive|reception)/.test(status)
            ? { statusRaw: 'at_local_hub', statusTitle: 'وصلت الشحنة إلى مركز التوزيع', description: 'وصل الطرد إلى مركز Maystro المحلي.' }
            : /(transit|transfer|vers|ligne|shipped)/.test(status)
              ? { statusRaw: 'in_transit', statusTitle: 'الشحنة في الطريق', description: 'تتحرك الشحنة عبر شبكة Maystro.' }
              : /(livre|delivered|completed|encaisse|paye)/.test(status)
                ? { statusRaw: 'delivered', statusTitle: 'تم تسليم الطلب بنجاح', description: 'أكدت Maystro تسليم الشحنة.' }
                : /(repond|injoignable|absent|unreachable|no_answer|failed|echec)/.test(status)
                  ? { statusRaw: 'attempt_failed', statusTitle: 'تعذرت محاولة التوصيل', description: 'سجلت Maystro محاولة توصيل غير مكتملة.' }
                  : /(report|postpone|retarde|demain)/.test(status)
                    ? { statusRaw: 'postponed', statusTitle: 'تم تأجيل التسليم', description: 'تم تأجيل موعد تسليم الشحنة.' }
                    : /(cancel|annul|aborted)/.test(status)
                      ? { statusRaw: 'cancelled', statusTitle: 'تم إلغاء الطلب', description: 'تم إلغاء الطلب لدى Maystro.' }
                      : /(retour|returned|refus)/.test(status)
                        ? { statusRaw: 'returned', statusTitle: 'الشحنة في مسار الإرجاع', description: 'تم تحويل الشحنة إلى مسار الإرجاع.' }
                        : null;

  if (legacy) return legacy;

  return {
    statusRaw: 'unknown',
    statusTitle: original ? `تحديث جديد من Maystro (\u200f${original})` : 'تحديث جديد من Maystro',
    description: original
      ? `وصل رمز حالة غير معروف من Maystro: ${original}. لم يتم تخمين معناه.`
      : 'وصل تحديث حالة من Maystro دون رمز معروف.',
  };
}

function isoTimestamp(value: unknown, fallback: string): string {
  const candidate = firstText(value);
  if (candidate) {
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return fallback;
}

function productDescription(order: Record<string, any>): string | undefined {
  const details = Array.isArray(order.details) ? order.details : [];
  const items = details.map((item: unknown) => {
    if (typeof item === 'string') return item.trim();
    const row = record(item);
    const product = record(row.product);
    const name = firstText(
      row.description, row.product_name, row.name, row.title,
      typeof row.product === 'string' || typeof row.product === 'number' ? row.product : undefined,
      product.name, product.description, product.title
    );
    if (!name) return '';
    const quantity = Number(row.quantity);
    return Number.isFinite(quantity) && quantity > 1 ? `${name} × ${quantity}` : name;
  }).filter(Boolean);

  return items.length
    ? items.join('، ')
    : firstText(order.logistical_description, order.product_name, order.product, order.description);
}

function productImage(order: Record<string, any>): string | undefined {
  const direct = firstText(order.product_image, order.image_url, order.image);
  if (direct) return direct;
  const details = Array.isArray(order.details) ? order.details : [];
  for (const item of details) {
    const row = record(item);
    const image = firstText(row.image_url, row.product_image, row.image);
    if (image) return image;
  }
  return undefined;
}

function historyEventKey(orderId: string, row: Record<string, any>, fallbackStatus: string): string {
  const override = firstText(row.__stableEventKey);
  const rowId = firstText(row.id, row.pk, row.history_id);
  const values = override
    ? [orderId, override]
    : rowId
      ? [orderId, rowId]
      : [
          orderId,
          firstText(row.status) || fallbackStatus,
          firstText(row.created_at, row.updated_at) || '',
          firstText(row.comment) || '',
          firstText(row.agent) || '',
        ];
  return createHash('sha256').update(values.join('|'), 'utf8').digest('hex');
}

export class MaystroAdapter {
  /** Backward-compatible normalizer for the original query-key webhook route. */
  static normalize(merchantId: string, rawPayload: unknown): TrackingEvent {
    let payload: Record<string, any>;
    if (Array.isArray(rawPayload)) {
      payload = record(rawPayload[0]);
    } else {
      payload = record(rawPayload);
    }

    if (payload.order && typeof payload.order === 'object') {
      payload = record(payload.order);
    } else if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      payload = record(payload.data);
    } else if (payload.payload && typeof payload.payload === 'object') {
      payload = record(payload.payload);
    }

    const orderId = firstText(payload.id, payload.order_id, payload.uuid);
    const trackingNumber = extractFirst(payload, [
      'display_id', 'tracking_id', 'tracking_number', 'tracking', 'barcode', 'code_suivi', 'id', 'order_id',
    ]);
    const carrierExternalOrderId = extractFirst(payload, [
      'external_order_id', 'external_id', 'order_number', 'reference',
    ]);
    const externalOrderId = carrierExternalOrderId || trackingNumber || `MAYSTRO-${orderId || 'UNKNOWN'}`;

    const customerName = extractFirst(payload, [
      'customer_name', 'client_name', 'client', 'name', 'destinataire', 'nom',
    ]);
    const customerPhone = normalizeAlgerianPhone(extractFirst(payload, [
      'customer_phone', 'phone', 'telephone', 'mobile', 'tel', 'client_phone',
    ]));
    let name = productDescription(payload) || extractFirst(payload, [
      'product_name', 'product', 'produit', 'logistical_description',
    ]);
    if (!name && Array.isArray(payload.products) && payload.products.length) {
      name = payload.products.map((item: unknown) => {
        if (typeof item === 'string') return item;
        const row = record(item);
        const label = firstText(row.name, row.description, row.title);
        const quantity = Number(row.quantity);
        return label && Number.isFinite(quantity) && quantity > 1 ? `${label} × ${quantity}` : label;
      }).filter(Boolean).join('، ');
    }

    const rawStatus = extractFirst(payload, [
      'status', 'current_status', 'statut', 'etat', 'state', 'order_status',
    ], '4') || '4';
    const rawReason = extractFirst(payload, [
      'reason', 'motif', 'motif_retour', 'sub_status', 'note_to_driver', 'note', 'comment', 'commentaire',
    ]);
    let mapped = mapMaystroStatus(rawStatus);
    const reason = normalizeDiacritics(safeLower(rawReason));
    if (/(injoignable|absent|unreachable|no_answer|no response|ne repond|ne répond)/.test(reason)) {
      mapped = {
        statusRaw: 'attempt_failed',
        statusTitle: 'تعذرت محاولة التوصيل',
        description: 'تعذر الوصول إلى العميل أثناء محاولة التوصيل.',
      };
    }

    const metadata: Record<string, unknown> = {
      provider: 'maystro',
      maystroOrderId: orderId || null,
      externalOrderId,
      displayId: trackingNumber || null,
      wilaya: payload.wilaya ?? null,
      commune: payload.commune ?? null,
      communeName: firstText(payload.commune_name) || null,
      destinationText: firstText(payload.destination_text, payload.address) || null,
      deliveryType: payload.delivery_type ?? null,
      totalPrice: payload.total_price ?? payload.price ?? null,
    };

    return {
      merchantId: safeString(merchantId),
      externalOrderId: safeString(externalOrderId),
      customerName: customerName ? safeString(customerName).trim() : undefined,
      customerPhone: customerPhone || undefined,
      productName: name ? safeString(name).trim() : undefined,
      productImage: productImage(payload),
      statusRaw: mapped.statusRaw,
      statusTitle: mapped.statusTitle,
      description: rawReason ? `${mapped.description} — ${rawReason}` : mapped.description,
      carrierName: 'Maystro Delivery',
      carrierTrackingNumber: trackingNumber || undefined,
      carrierOrderId: orderId || undefined,
      carrierExternalOrderId: carrierExternalOrderId || undefined,
      carrierMetadata: metadata,
    };
  }

  /**
   * Convert a fetched Maystro order plus its full history into ordered
   * TrackingEvents. Maystro status webhooks are treated as wake-up signals;
   * order fields and status history are re-read from the authenticated API.
   */
  static normalizeOrderHistory(
    merchantId: string,
    rawOrder: unknown,
    rawHistory: unknown,
    webhookEventType = 'OrderFieldUpdated'
  ): TrackingEvent[] {
    const order = record(rawOrder);
    const orderId = firstText(order.id, order.order_id, order.uuid);
    if (!orderId) throw new Error('Maystro order response did not include its internal order UUID.');

    const trackingNumber = firstText(order.display_id, order.tracking, order.tracking_number);
    const carrierExternalOrderId = firstText(order.external_order_id, order.external_id);
    const externalOrderId = carrierExternalOrderId || trackingNumber || `MAYSTRO-${orderId}`;
    const productName = productDescription(order);
    const customerPhone = normalizeAlgerianPhone(firstText(order.customer_phone, order.customer_phone2, order.phone));
    const fallbackTime = isoTimestamp(order.ordered_at || order.created_at || order.updated_at, new Date().toISOString());
    const metadata: Record<string, unknown> = {
      provider: 'maystro',
      maystroOrderId: orderId,
      externalOrderId,
      displayId: trackingNumber || null,
      wilaya: firstText(order.wilaya) || null,
      commune: order.commune ?? null,
      communeName: firstText(order.commune_name) || null,
      destinationText: firstText(order.destination_text) || null,
      deliveryType: order.delivery_type ?? null,
      totalPrice: order.total_price ?? order.price ?? null,
      productPrice: order.product_price ?? null,
      customerPhone2: firstText(order.customer_phone2) || null,
      orderedAt: firstText(order.ordered_at) || null,
      shippedAt: firstText(order.shipped_at) || null,
      deliveredAt: firstText(order.delivered_at) || null,
      abortReason: order.abort_reason ?? null,
      products: Array.isArray(order.details) ? order.details.map((item: unknown) => {
        const row = record(item);
        return {
          description: firstText(
            row.description, row.product_name, row.name,
            record(row.product).name, record(row.product).description
          ) || null,
          quantity: row.quantity ?? null,
          product: row.product ?? null,
          unitPrice: row.unit_price ?? row.price ?? record(row.product).unit_price ?? null,
          image: firstText(row.image_url, row.product_image, row.image, record(row.product).image_url) || null,
        };
      }) : [],
    };

    let history: Record<string, any>[] = Array.isArray(rawHistory)
      ? rawHistory.map(record)
      : Array.isArray(record(rawHistory).results)
        ? record(rawHistory).results.map(record)
        : [];

    history = history.filter((row) => row.status !== undefined && row.status !== null);
    history.sort((a, b) => {
      const aTime = Date.parse(firstText(a.created_at, a.updated_at) || '') || 0;
      const bTime = Date.parse(firstText(b.created_at, b.updated_at) || '') || 0;
      return aTime - bTime;
    });

    const currentStatus = order.status ?? order.current_status;
    const lastHistoryStatus = history.length ? history[history.length - 1].status : undefined;
    if (!history.length) {
      history = [{
      status: currentStatus ?? '4',
      created_at: order.updated_at || order.ordered_at || order.created_at,
      __stableEventKey: `snapshot:${orderId}:${String(currentStatus ?? '4')}`,
    }];
    } else if (
      currentStatus !== undefined &&
      currentStatus !== null &&
      String(currentStatus) !== String(lastHistoryStatus)
    ) {
      history.push({
        status: currentStatus,
        created_at: order.updated_at || order.last_status_updated_at || order.ordered_at,
        __stableEventKey: `snapshot:${orderId}:${String(currentStatus)}`,
      });
    }

    return history.map((row) => {
      const statusValue = row.status;
      const mapped = mapMaystroStatus(statusValue);
      const comment = firstText(row.comment);
      const occurredAt = isoTimestamp(row.created_at || row.updated_at, fallbackTime);
      const eventId = historyEventKey(orderId, row, String(statusValue ?? ''));

      return {
        merchantId: safeString(merchantId),
        externalOrderId,
        customerName: firstText(order.customer_name, order.client_name, order.name),
        customerPhone: customerPhone || undefined,
        productName,
        productImage: productImage(order),
        statusRaw: mapped.statusRaw,
        statusTitle: mapped.statusTitle,
        description: comment
          ? `${mapped.description} ملاحظة شركة التوصيل: ${comment}`
          : mapped.description,
        carrierName: 'Maystro Delivery',
        carrierTrackingNumber: trackingNumber,
        carrierOrderId: orderId,
        carrierExternalOrderId,
        carrierMetadata: metadata,
        sourceOccurredAt: occurredAt,
        sourceEventType: webhookEventType,
        sourceEventId: eventId,
        sourceProvider: 'maystro',
      };
    });
  }
}
