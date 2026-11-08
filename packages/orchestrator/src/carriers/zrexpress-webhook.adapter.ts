import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TrackingEvent } from '../index';
import { normalizeAlgerianPhone, safeString } from '../utils/safe';

export const ZR_EXPRESS_WEBHOOK_EVENT_TYPES = [
  'parcel.state.updated',
  'parcel.state.situation.created',
  'parcel.isReturn.updated',
] as const;

export type ZRExpressWebhookEventType = (typeof ZR_EXPRESS_WEBHOOK_EVENT_TYPES)[number];

export interface ZRExpressWebhookEvent {
  eventType: ZRExpressWebhookEventType;
  occurredAt: string;
  data: Record<string, any>;
}

const STATE_MAP: Record<string, { status: string; title: string }> = {
  picked_up: { status: 'dispatched', title: 'استلمت ZR Express الشحنة من التاجر' },
  in_transit: { status: 'in_transit', title: 'الشحنة في الطريق بين الولايات' },
  out_for_delivery: { status: 'out_for_delivery', title: 'خرج المندوب لتسليم الشحنة' },
  delivered: { status: 'delivered', title: 'تم تسليم الشحنة' },
  returned: { status: 'returned', title: 'الشحنة في مسار الإرجاع' },
  returned_to_hub: { status: 'returned', title: 'عادت الشحنة إلى مركز ZR Express' },
  cancelled: { status: 'cancelled', title: 'تم إلغاء الشحنة' },
  commande_recue: { status: 'order_placed', title: 'تم استلام الشحنة لدى ZR Express' },
  en_traitement: { status: 'processing', title: 'الشحنة قيد المعالجة' },
  appel_confirmation: { status: 'processing', title: 'جارٍ تأكيد بيانات الشحنة' },
  commande_confirmee: { status: 'processing', title: 'تم تأكيد الشحنة' },
  en_preparation: { status: 'processing', title: 'يجري تجهيز الشحنة' },
  pret_a_expedier: { status: 'processing', title: 'الشحنة جاهزة للإرسال' },
  confirme_au_bureau: { status: 'at_local_hub', title: 'تم تسجيل الشحنة في مكتب ZR Express' },
  remboursement_reinjecte: { status: 'returned', title: 'تمت إعادة الشحنة إلى مسار الإرجاع' },
  dispatch: { status: 'in_transit', title: 'غادرت الشحنة مركز الإرسال' },
  vers_wilaya: { status: 'in_transit', title: 'الشحنة في الطريق إلى ولاية الوجهة' },
  en_livraison: { status: 'in_transit', title: 'الشحنة ضمن مسار التوصيل' },
  en_attente_dechange: { status: 'postponed', title: 'الشحنة بانتظار معالجة الاستبدال' },
  colis_recupere: { status: 'returned', title: 'تم استرجاع الشحنة' },
  attente_recuperation_fournisseur: { status: 'returned', title: 'الشحنة بانتظار استلام التاجر' },
  reinjecte_dans_stock: { status: 'returned', title: 'أُعيدت الشحنة إلى المخزون' },
  recupere_par_fournisseur: { status: 'returned', title: 'استلم التاجر الشحنة المرتجعة' },
  sortie_en_livraison: { status: 'out_for_delivery', title: 'خرج المندوب لتسليم الشحنة' },
  livre: { status: 'delivered', title: 'تم تسليم الشحنة' },
  encaisse: { status: 'delivered', title: 'تم تحصيل مبلغ الشحنة' },
  recouvert: { status: 'delivered', title: 'تم تحصيل مستحقات الشحنة' },
};

function normalizeStateKey(value: unknown): string {
  return safeString(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
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

export function isZRExpressWebhookEvent(value: unknown): value is ZRExpressWebhookEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.eventType === 'string' &&
    (ZR_EXPRESS_WEBHOOK_EVENT_TYPES as readonly string[]).includes(event.eventType) &&
    typeof event.occurredAt === 'string' &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    Boolean(event.data) &&
    typeof event.data === 'object' &&
    !Array.isArray(event.data)
  );
}

/**
 * Verify Svix exactly as ZR Express signs it: HMAC-SHA256 over
 * "{svix-id}.{svix-timestamp}.{raw body}", using the base64 key in whsec_*.
 * The body is parsed only after the signature and five-minute timestamp check.
 */
export function verifyZRExpressWebhook(
  secret: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
  nowMs = Date.now()
): { id: string; event: ZRExpressWebhookEvent } {
  const messageId = headers['svix-id']?.trim();
  const timestamp = headers['svix-timestamp']?.trim();
  const signatureHeader = headers['svix-signature']?.trim();

  if (!messageId || !timestamp || !signatureHeader) {
    throw new Error('Missing required Svix signature headers.');
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > 300) {
    throw new Error('Svix webhook timestamp is outside the allowed five-minute window.');
  }

  if (!secret.startsWith('whsec_')) {
    throw new Error('ZR Express webhook signing secret is not valid.');
  }
  const encodedKey = secret.slice('whsec_'.length);
  const key = Buffer.from(encodedKey, 'base64');
  if (!key.length) throw new Error('ZR Express webhook signing secret is empty.');

  const signedContent = `${messageId}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent, 'utf8').digest();

  const matches = signatureHeader
    .split(/\s+/)
    .map((part) => part.split(',', 2))
    .filter(([version, signature]) => version === 'v1' && Boolean(signature))
    .some(([, signature]) => {
      const supplied = Buffer.from(signature!, 'base64');
      return supplied.length === expected.length && timingSafeEqual(expected, supplied);
    });

  if (!matches) throw new Error('ZR Express webhook signature verification failed.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('Verified ZR Express webhook body is not valid JSON.');
  }
  if (!isZRExpressWebhookEvent(parsed)) {
    throw new Error('Verified payload is not a recognized ZR Express webhook event.');
  }

  const parcel = parsed.data;
  if (!firstText(parcel.trackingNumber, parcel.externalId, parcel.id)) {
    throw new Error('ZR Express webhook does not contain a parcel identifier.');
  }

  return { id: messageId, event: parsed };
}

export class ZRExpressWebhookAdapter {
  static normalize(merchantId: string, webhook: ZRExpressWebhookEvent, sourceEventId?: string): TrackingEvent {
    const parcel = webhook.data;
    const state = parcel.state && typeof parcel.state === 'object' ? parcel.state : {};
    const situation = parcel.situation && typeof parcel.situation === 'object' ? parcel.situation : {};
    const stateName = firstText(state.name);
    const stateKey = normalizeStateKey(stateName);
    const isReturn = parcel.isReturn === true;
    const mapped = STATE_MAP[stateKey];
    const statusRaw = isReturn ? 'returned' : (mapped?.status || (stateKey ? `zr_${stateKey}` : ''));
    if (!statusRaw) {
      throw new Error('ZR Express event does not include a parcel state or an active return flag.');
    }

    const phone = parcel.customer?.phone;
    let phoneValue: unknown;
    if (typeof phone === 'string' || typeof phone === 'number') {
      phoneValue = phone;
    } else if (phone && typeof phone === 'object') {
      const countryCode = firstText(phone.countryCode);
      const number = firstText(phone.number, phone.number1, phone.number2, phone.number3);
      if (countryCode && number) {
        const countryDigits = countryCode.replace(/\D/g, '');
        const numberDigits = number.replace(/\D/g, '');
        if (countryDigits && !numberDigits.startsWith(countryDigits)) {
          const nationalNumber = countryDigits === '213' && numberDigits.startsWith('0')
            ? numberDigits.slice(1)
            : numberDigits;
          phoneValue = `${countryDigits}${nationalNumber}`;
        } else {
          phoneValue = number;
        }
      } else {
        phoneValue = number;
      }
    }
    const customerPhone = normalizeAlgerianPhone(phoneValue);

    const trackingNumber = firstText(parcel.trackingNumber);
    const externalId = firstText(parcel.externalId);
    const parcelId = firstText(parcel.id);
    const externalOrderId = externalId || (parcelId ? `ZR-${parcelId}` : trackingNumber);
    if (!externalOrderId) throw new Error('ZR Express event has no usable external order or parcel ID.');

    const situationName = firstText(situation.name, situation.slug);
    const statusTitle = isReturn
      ? 'تم تحويل الشحنة إلى مسار الإرجاع'
      : webhook.eventType === 'parcel.state.situation.created'
        ? situationName || mapped?.title || stateName || statusRaw
        : mapped?.title || stateName || statusRaw;

    const firstProduct = Array.isArray(parcel.orderedProducts)
      ? parcel.orderedProducts.find((item: any) => firstText(item?.productName))
      : undefined;
    const productName = firstText(
      parcel.productsDescription,
      firstProduct?.productName
    );

    return {
      merchantId: safeString(merchantId),
      externalOrderId: safeString(externalOrderId),
      customerName: firstText(parcel.customer?.name),
      customerPhone: customerPhone || undefined,
      productName,
      statusRaw,
      statusTitle,
      description: firstText(
        situation.description,
        webhook.eventType === 'parcel.state.situation.created' ? situation.name : undefined,
        state.description
      ),
      carrierName: 'ZR Express',
      carrierTrackingNumber: trackingNumber,
      sourceOccurredAt: webhook.occurredAt,
      sourceEventType: webhook.eventType,
      sourceEventId,
    };
  }
}
