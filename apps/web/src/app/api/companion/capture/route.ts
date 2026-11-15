import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function verifySignatureForDevice(publicKeyJwk: any, message: string, signature: string): boolean {
  try {
    if (
      !publicKeyJwk || publicKeyJwk.kty !== 'EC' || publicKeyJwk.crv !== 'P-256' ||
      typeof publicKeyJwk.x !== 'string' || typeof publicKeyJwk.y !== 'string'
    ) return false;
    const key = createPublicKey({ key: publicKeyJwk, format: 'jwk' });
    const signatureBytes = Buffer.from(signature, 'base64url');
    if (signatureBytes.length !== 64) return false;
    return verifySignature(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      signatureBytes
    );
  } catch {
    return false;
  }
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result && result.length <= maxLength ? result : null;
}

function cleanPhone(value: unknown): string | null {
  const phone = cleanString(value, 60);
  if (!phone || phone.includes('*')) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 20 ? phone : null;
}

function isMasked(value: unknown): boolean {
  return typeof value === 'string' && value.includes('*');
}

async function applyCaptureToUniqueOrder(supabase: any, capture: any): Promise<'matched' | 'not-found' | 'ambiguous' | 'other-carrier'> {
  const { data: matches, error } = await supabase
    .from('orders')
    .select('id, customer_name, customer_phone, product_name, carrier_name, carrier_metadata')
    .eq('merchant_id', capture.merchant_id)
    .eq('external_order_id', capture.external_order_id)
    .limit(2);
  if (error) throw new Error('Could not match a companion capture to its TajerTrack order.');
  if (!matches?.length) return 'not-found';
  if (matches.length !== 1) return 'ambiguous';

  const order = matches[0];
  if (order.carrier_name && !['Yalidine Express', 'Guepex', 'Yalidine'].includes(order.carrier_name)) {
    return 'other-carrier';
  }

  const updates: Record<string, unknown> = {};
  if (capture.customer_name && (!order.customer_name || isMasked(order.customer_name))) {
    updates.customer_name = capture.customer_name;
  }
  if (capture.customer_phone && (!order.customer_phone || isMasked(order.customer_phone))) {
    updates.customer_phone = capture.customer_phone;
  }
  if (capture.product_name && !String(order.product_name || '').trim()) {
    updates.product_name = capture.product_name;
  }
  const currentMetadata = order.carrier_metadata && typeof order.carrier_metadata === 'object' && !Array.isArray(order.carrier_metadata)
    ? order.carrier_metadata : {};
  updates.carrier_metadata = {
    ...currentMetadata,
    yalidine_companion_captured_at: capture.captured_at || capture.received_at,
    yalidine_companion_identity_source: 'browser_parcel_creation',
  };

  const { error: updateError } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('merchant_id', capture.merchant_id);
  if (updateError) throw new Error('Could not apply the companion identity to its TajerTrack order.');

  const { error: deleteError } = await supabase
    .from('yalidine_companion_captures')
    .delete()
    .eq('id', capture.id)
    .eq('merchant_id', capture.merchant_id);
  if (deleteError) throw new Error('Could not clear the matched companion capture.');
  return 'matched';
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Capture payload is too large.' }, { status: 413 });
  }

  let rawBody = '';
  try { rawBody = await req.text(); } catch {
    return NextResponse.json({ error: 'Could not read capture payload.' }, { status: 400 });
  }
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Capture payload is empty or too large.' }, { status: 400 });
  }

  const timestampHeader = req.headers.get('x-tt-timestamp') || '';
  const nonce = req.headers.get('x-tt-nonce') || '';
  const signature = req.headers.get('x-tt-signature') || '';
  const timestamp = Number(timestampHeader);
  if (
    !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS ||
    !UUID_RE.test(nonce) || !/^[A-Za-z0-9_-]{80,100}$/.test(signature)
  ) {
    return NextResponse.json({ error: 'Capture proof is invalid or expired.' }, { status: 401 });
  }

  let request: any;
  try { request = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: 'Capture payload is malformed.' }, { status: 400 });
  }
  const installationId = request?.installationId;
  const source = request?.payload;
  if (!UUID_RE.test(String(installationId || '')) || !source || typeof source !== 'object' || Array.isArray(source)) {
    return NextResponse.json({ error: 'Capture identity is invalid.' }, { status: 400 });
  }

  const externalOrderId = cleanString(source.orderId, 255);
  const rawName = cleanString(source.customerName, 200);
  const customerName = rawName && !rawName.includes('*') ? rawName : null;
  const customerPhone = cleanPhone(source.customerPhone);
  const trackingNumber = cleanString(source.trackingNumber, 128);
  const productName = cleanString(source.productName, 200);
  if (!externalOrderId || (!customerName && !customerPhone)) {
    return NextResponse.json({ error: 'Capture does not contain a usable order identity.' }, { status: 422 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: device, error: deviceError } = await (supabase as any)
    .from('merchant_companion_devices')
    .select('merchant_id, installation_id, public_key')
    .eq('installation_id', installationId)
    .is('revoked_at', null)
    .maybeSingle();
  if (deviceError || !device) {
    return NextResponse.json({ error: 'Companion installation is not paired.' }, { status: 401 });
  }

  if (!verifySignatureForDevice(device.public_key, `${timestampHeader}\n${nonce}\n${rawBody}`, signature)) {
    return NextResponse.json({ error: 'Capture signature is invalid.' }, { status: 401 });
  }

  const capturePayload = {
    externalOrderId,
    customerName,
    customerPhone,
    trackingNumber,
    productName,
  };
  const payloadHash = createHash('sha256').update(JSON.stringify(capturePayload), 'utf8').digest('hex');
  const capturedAt = cleanString(source.capturedAt, 64);
  const receivedAt = new Date().toISOString();
  const { data: capture, error: captureError } = await (supabase as any)
    .from('yalidine_companion_captures')
    .insert({
      merchant_id: device.merchant_id,
      installation_id: device.installation_id,
      external_order_id: externalOrderId,
      tracking_number: trackingNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      product_name: productName,
      captured_at: capturedAt && Number.isFinite(Date.parse(capturedAt)) ? new Date(capturedAt).toISOString() : receivedAt,
      capture_nonce: nonce,
      payload_hash: payloadHash,
      received_at: receivedAt,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
    })
    .select('id, merchant_id, external_order_id, customer_name, customer_phone, product_name, captured_at, received_at')
    .single();

  if (captureError) {
    if (captureError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true, matched: false }, { status: 200 });
    }
    return NextResponse.json({ error: 'Could not queue the captured customer identity.' }, { status: 500 });
  }

  await (supabase as any)
    .from('merchant_companion_devices')
    .update({ last_seen_at: receivedAt })
    .eq('merchant_id', device.merchant_id)
    .eq('installation_id', device.installation_id)
    .is('revoked_at', null);

  try {
    const matchResult = await applyCaptureToUniqueOrder(supabase, capture);
    if (matchResult === 'other-carrier') {
      await (supabase as any).from('yalidine_companion_captures').delete().eq('id', capture.id);
      return NextResponse.json({ success: true, ignored: true, matched: false }, { status: 200 });
    }
    return NextResponse.json({
      success: true,
      accepted: true,
      matched: matchResult === 'matched',
      pending: matchResult === 'not-found' || matchResult === 'ambiguous',
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Retain the pending capture; the Yalidine processor can retry after parcel sync.
    return NextResponse.json({ success: true, accepted: true, pending: true }, { status: 202 });
  }
}
