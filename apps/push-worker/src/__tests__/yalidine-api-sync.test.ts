import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptYalidineApiCredentials } from '../yalidine-credentials.js';
import {
  buildGuepexHistoriesUrl,
  buildGuepexParcelListUrl,
  buildGuepexParcelUrl,
  buildGuepexParcelsByOrderIdsUrl,
  getGuepexSyncCursor,
  createGuepexApiEnrichmentEvent,
  createGuepexApiEvent,
  normalizeGuepexParcel,
  normalizeGuepexParcelList,
} from '../yalidine-webhook-worker.js';

const baseParcel = {
  tracking: 'yal-123456',
  order_id: 'STORE-ORDER-123',
  firstname: 'M*****d',
  familyname: 'E* A****',
  contact_phone: '0********9',
  product_list: 'Machine à café',
  price: 2400,
  delivery_fee: 500,
  last_status: 'En transit',
  date_creation: '2026-11-14 08:00:00',
  date_last_status: '2026-11-15 10:00:00',
  to_wilaya_name: 'Alger',
  to_commune_name: 'Bordj El Kiffan',
  label: 'https://guepex.app/app/bordereau.php?tracking=yal-123456',
  address: 'C*** K****',
  pin: '1572',
  qr_text: 'sensitive-qr-value',
};

const linkedOrder = {
  id: 'order-uuid',
  external_order_id: 'STORE-ORDER-123',
  carrier_name: 'Yalidine Express',
  carrier_tracking_number: 'yal-123456',
  carrier_last_event_at: '2026-11-15T08:00:00.000Z',
};

test('normalizes Guepex top-level data, body and nested data parcel lists', () => {
  assert.deepEqual(normalizeGuepexParcelList({ data: [baseParcel] }), [baseParcel]);
  assert.deepEqual(normalizeGuepexParcelList({ body: [baseParcel] }), [baseParcel]);
  assert.deepEqual(normalizeGuepexParcelList({ data: { data: [baseParcel] } }), [baseParcel]);
  assert.deepEqual(normalizeGuepexParcelList({ has_more: false, data: [] }), []);
  assert.throws(() => normalizeGuepexParcelList({ success: false, message: 'unauthorized' }));
});

test('forces full account reconciliation on manual refresh while keeping scheduled sync incremental', () => {
  assert.equal(getGuepexSyncCursor('2026-11-14T10:00:00.000Z'), '2026-11-14T10:00:00.000Z');
  assert.equal(getGuepexSyncCursor('2026-11-14T10:00:00.000Z', '2026-11-15T10:00:00.000Z'), null);
  assert.equal(getGuepexSyncCursor(null, '2026-11-15T10:00:00.000Z'), null);
});

test('builds a paginated Guepex histories request for unique linked tracking numbers', () => {
  const url = buildGuepexHistoriesUrl(['yal-001', 'yal-002', 'yal-001'], 3);
  assert.equal(url.pathname, '/v1/histories/');
  assert.equal(url.searchParams.get('tracking'), 'yal-001,yal-002');
  assert.equal(url.searchParams.get('page'), '3');
  assert.equal(url.searchParams.get('page_size'), '100');
  assert.equal(url.searchParams.get('order_by'), 'date_status');
  const fields = (url.searchParams.get('fields') || '').split(',');
  assert.ok(fields.includes('date_status'));
  assert.ok(fields.includes('tracking'));
  assert.ok(fields.includes('status'));
  assert.ok(fields.includes('reason'));
  assert.ok(fields.includes('center_name'));
  assert.ok(fields.includes('wilaya_name'));
  assert.ok(fields.includes('commune_name'));
});

test('builds a direct Guepex parcel lookup URL with an explicit safe field projection', () => {
  const url = buildGuepexParcelUrl('yal-123456');
  assert.equal(url.pathname, '/v1/parcels/yal-123456');
  const fields = (url.searchParams.get('fields') || '').split(',');
  assert.ok(fields.includes('tracking'));
  assert.ok(fields.includes('order_id'));
  assert.ok(fields.includes('product_list'));
  assert.equal(fields.includes('address'), false);
  assert.equal(fields.includes('qr_text'), false);
  assert.equal(fields.includes('pin'), false);
});

test('looks up existing TajerTrack orders in one Guepex request by their original order references', () => {
  const url = buildGuepexParcelsByOrderIdsUrl(['STORE-001', 'STORE-002', 'STORE-001']);
  assert.equal(url.pathname, '/v1/parcels/');
  assert.equal(url.searchParams.get('order_id'), 'STORE-001,STORE-002');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('page_size'), '100');
  const fields = (url.searchParams.get('fields') || '').split(',');
  assert.ok(fields.includes('tracking'));
  assert.ok(fields.includes('order_id'));
  assert.ok(fields.includes('product_list'));
  assert.equal(fields.includes('address'), false);
  assert.equal(fields.includes('qr_text'), false);
  assert.equal(fields.includes('pin'), false);
});

test('normalizes single-parcel API response shapes and preserves the requested tracking fallback', () => {
  assert.deepEqual(normalizeGuepexParcel({ data: [baseParcel] }, 'yal-123456'), baseParcel);
  assert.deepEqual(normalizeGuepexParcel({ data: { ...baseParcel, tracking: undefined } }, 'yal-123456'), {
    ...baseParcel,
    tracking: 'yal-123456',
  });
  assert.equal(normalizeGuepexParcel({ success: true, data: {} }, 'yal-123456'), null);
});

test('creates a data-only enrichment event for an existing order without sending sensitive fields', () => {
  const event = createGuepexApiEnrichmentEvent(
    'merchant-1',
    baseParcel,
    'yal-123456',
    'STORE-ORDER-123',
    '2026-11-15T10:00:00.000Z'
  );
  assert.ok(event);
  assert.equal(event?.event_type, 'parcel_edited');
  const payload = event?.payload as any;
  assert.equal(payload.type, 'parcel_edited');
  assert.equal(payload.data.tracking, 'yal-123456');
  assert.equal(payload.data.order_id, 'STORE-ORDER-123');
  assert.equal(payload.data.product_list, 'Machine à café');
  assert.equal(payload.data.__guepex_api_lookup, true);
  assert.equal(payload.data.__guepex_api_lookup_version, 3);
  assert.equal('address' in payload.data, false);
  assert.equal('pin' in payload.data, false);
  assert.equal('qr_text' in payload.data, false);
});

test('classifies an existing tracked parcel with a newer provider timestamp as a status event', () => {
  const row = createGuepexApiEvent('merchant-1', baseParcel, linkedOrder);
  assert.ok(row);
  assert.equal(row?.event_type, 'parcel_status_updated');
  assert.equal(row?.merchant_id, 'merchant-1');
  assert.equal((row?.payload as any).data.tracking, 'yal-123456');
  assert.equal((row?.payload as any).data.status, 'En transit');
  assert.equal((row?.payload as any).data.__guepex_api_lookup, true);
  assert.equal((row?.payload as any).data.__guepex_api_lookup_version, 3);
  assert.equal(row?.occurred_at, '2026-11-15T09:00:00.000Z');
});

test('classifies an order-reference match without an attached tracking number as parcel creation', () => {
  const row = createGuepexApiEvent('merchant-1', baseParcel, {
    ...linkedOrder,
    carrier_name: null,
    carrier_tracking_number: null,
    carrier_last_event_at: null,
  });
  assert.ok(row);
  assert.equal(row?.event_type, 'parcel_created');
});

test('classifies an unchanged or older tracked parcel as data-only edit', () => {
  const row = createGuepexApiEvent('merchant-1', {
    ...baseParcel,
    date_last_status: '2026-11-15 08:30:00',
  }, linkedOrder);
  assert.ok(row);
  assert.equal(row?.occurred_at, '2026-11-15T07:30:00.000Z');
  assert.equal(row?.event_type, 'parcel_edited');
});

test('uses deterministic event identities and excludes address, PIN and QR personal/security fields', () => {
  const first = createGuepexApiEvent('merchant-1', baseParcel, linkedOrder);
  const second = createGuepexApiEvent('merchant-1', { ...baseParcel }, linkedOrder);
  assert.equal(first?.event_id, second?.event_id);

  const data = (first?.payload as any).data;
  assert.equal(data.firstname, 'M*****d');
  assert.equal(data.contact_phone, '0********9');
  assert.equal(data.label, baseParcel.label);
  assert.equal('address' in data, false);
  assert.equal('pin' in data, false);
  assert.equal('qr_text' in data, false);
});

test('ignores a Guepex parcel assigned to a different carrier in TajerTrack', () => {
  const row = createGuepexApiEvent('merchant-1', baseParcel, {
    ...linkedOrder,
    carrier_name: 'EcoTrack',
  });
  assert.equal(row, null);
});

test('ignores malformed API parcel records without tracking or a usable event timestamp', () => {
  assert.equal(createGuepexApiEvent('merchant-1', { ...baseParcel, tracking: '' }, linkedOrder), null);
  assert.equal(createGuepexApiEvent('merchant-1', { ...baseParcel, date_last_status: '', date_creation: '' }, linkedOrder), null);
});


test('decrypts API credentials using the same merchant-scoped AES-GCM envelope as the web app', () => {
  const merchantId = 'merchant-guepex-1';
  const encryptionSecret = 'test-encryption-secret-with-at-least-32-characters';
  const credentials = {
    webhookSecret: 'webhook-test-secret',
    apiId: '12345678901234567890',
    apiToken: 'test-api-token-long-enough-for-validation',
  };
  const iv = randomBytes(12);
  const key = createHash('sha256').update(encryptionSecret, 'utf8').digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${merchantId}:yalidine-webhook:v1`, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  const encrypted = [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');

  assert.deepEqual(
    decryptYalidineApiCredentials(encrypted, merchantId, encryptionSecret),
    { apiId: credentials.apiId, apiToken: credentials.apiToken }
  );
  assert.throws(() => decryptYalidineApiCredentials(encrypted, 'another-merchant', encryptionSecret));
  assert.throws(() => decryptYalidineApiCredentials(encrypted, merchantId, 'wrong-encryption-secret'));
});


test('requests the non-personal product and shipment fields explicitly from Guepex', () => {
  const initial = buildGuepexParcelListUrl(1, null, new Date('2026-11-15T10:00:00.000Z'));
  const fields = (initial.searchParams.get('fields') || '').split(',');
  assert.ok(fields.includes('product_list'));
  assert.ok(fields.includes('tracking'));
  assert.ok(fields.includes('order_id'));
  assert.ok(fields.includes('firstname'));
  assert.ok(fields.includes('familyname'));
  assert.ok(fields.includes('contact_phone'));
  assert.ok(fields.includes('last_status'));
  assert.equal(fields.includes('address'), false);
  assert.equal(fields.includes('qr_text'), false);
  assert.equal(fields.includes('pin'), false);
  assert.equal(initial.searchParams.has('date_last_status'), false);

  const incremental = buildGuepexParcelListUrl(2, '2026-11-14T10:00:00.000Z', new Date('2026-11-15T10:00:00.000Z'));
  assert.equal(incremental.searchParams.get('page'), '2');
  assert.equal(incremental.searchParams.get('date_last_status'), '2026-11-12,2026-11-15');
});
