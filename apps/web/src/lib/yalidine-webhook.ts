import { createHmac, timingSafeEqual } from 'node:crypto';

export const YALIDINE_WEBHOOK_EVENT_TYPES = [
  'parcel_created',
  'parcel_edited',
  'parcel_deleted',
  'parcel_status_updated',
  'parcel_payment_updated',
] as const;

export type YalidineWebhookEventType = typeof YALIDINE_WEBHOOK_EVENT_TYPES[number];

export interface YalidineWebhookEvent {
  event_id: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

export interface YalidineWebhookEnvelope {
  type: YalidineWebhookEventType;
  events: YalidineWebhookEvent[];
}

export function parseYalidineOccurredAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  let normalized = raw;
  // The carrier dashboard sends local Algeria timestamps without an offset.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)) {
    normalized = raw.replace(' ', 'T') + '+01:00';
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function isYalidineWebhookEventType(value: unknown): value is YalidineWebhookEventType {
  return typeof value === 'string' && (YALIDINE_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

/** The provider signs the exact raw request body with HMAC-SHA256 and sends lowercase/uppercase hex. */
export function verifyYalidineWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  const signature = String(signatureHeader || '').trim().toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}
