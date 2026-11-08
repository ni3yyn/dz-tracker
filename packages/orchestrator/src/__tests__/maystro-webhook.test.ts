import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapMaystroStatus,
  MaystroAdapter,
  parseMaystroWebhookEnvelope,
} from '../carriers/maystro.adapter.js';

const orderId = '1394335a-4470-407c-a464-d90932de5510';

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    display_id: '172316976800001',
    tracking: '172316976800001',
    external_order_id: 'STORE-ORDER-9001',
    customer_name: 'Test Client',
    customer_phone: '0555123456',
    customer_phone2: '0666554433',
    wilaya: 'Alger',
    commune: 554,
    commune_name: 'Alger Centre',
    destination_text: '12 Rue Test',
    delivery_type: 1,
    total_price: 4500,
    status: 41,
    updated_at: '2026-10-22T10:05:00+01:00',
    details: [
      { description: 'T-shirt', quantity: 2, product: '', image_url: 'https://cdn.example.test/tshirt.jpg' },
      { description: 'Cap', quantity: 1, product: '' },
    ],
    ...overrides,
  };
}

test('parses a single-Base64 Maystro OrderFieldUpdated notification', () => {
  const eventJson = JSON.stringify({
    event: 'OrderFieldUpdated',
    payload: { id: orderId, field: 'status', value: 31 },
  });
  const result = parseMaystroWebhookEnvelope(JSON.stringify({
    message: { data: encode(eventJson) },
  }));

  assert.equal(result.eventType, 'OrderFieldUpdated');
  assert.equal(result.orderId, orderId);
  assert.equal(result.isTest, false);
});

test('parses the double-Base64 variant described in Maystro webhook docs', () => {
  const eventJson = JSON.stringify({
    event: 'OrderDelivered',
    payload: { id: orderId },
  });
  const result = parseMaystroWebhookEnvelope(JSON.stringify({
    message: { data: encode(encode(eventJson)) },
  }));

  assert.equal(result.eventType, 'OrderDelivered');
  assert.equal(result.orderId, orderId);
});

test('recognizes Maystro test events without requiring an order id', () => {
  const result = parseMaystroWebhookEnvelope(JSON.stringify({
    event: 'test',
    message: { data: encode(JSON.stringify({ ping: true })) },
  }));

  assert.equal(result.isTest, true);
  assert.equal(result.orderId, null);
});

test('rejects invalid JSON and non-JSON Base64 data', () => {
  assert.throws(() => parseMaystroWebhookEnvelope('{bad json'), /not valid JSON/);
  assert.throws(
    () => parseMaystroWebhookEnvelope(JSON.stringify({ message: { data: encode('not-json') } })),
    /could not be decoded as JSON/
  );
});

test('maps documented numeric Maystro statuses without treating cancellation as return', () => {
  assert.equal(mapMaystroStatus(41).statusRaw, 'delivered');
  assert.equal(mapMaystroStatus('50').statusRaw, 'cancelled');
  assert.equal(mapMaystroStatus(51).statusRaw, 'returned');
  assert.equal(mapMaystroStatus(31).statusRaw, 'in_transit');
  assert.equal(mapMaystroStatus(999).statusRaw, 'unknown');
});

test('normalizes full order details and oldest-first history into tracking events', () => {
  const events = MaystroAdapter.normalizeOrderHistory(
    'merchant-1',
    orderFixture(),
    [
      { status: 41, created_at: '2026-10-22T10:05:00+01:00', comment: 'Livré' },
      { status: 31, created_at: '2026-10-21T10:05:00+01:00', comment: null },
      { status: 4, created_at: '2026-10-20T09:12:13+01:00', comment: null },
    ],
    'OrderDelivered'
  );

  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.statusRaw), ['processing', 'in_transit', 'delivered']);
  assert.equal(events[0].externalOrderId, 'STORE-ORDER-9001');
  assert.equal(events[0].customerName, 'Test Client');
  assert.equal(events[0].customerPhone, '213555123456');
  assert.equal(events[0].productName, 'T-shirt × 2، Cap');
  assert.equal(events[0].productImage, 'https://cdn.example.test/tshirt.jpg');
  assert.equal((events[0].carrierMetadata?.['products'] as any[])[0].unitPrice, null);
  assert.equal(events[0].carrierTrackingNumber, '172316976800001');
  assert.equal(events[0].carrierOrderId, orderId);
  assert.equal(events[0].carrierExternalOrderId, 'STORE-ORDER-9001');
  assert.equal(events[0].sourceProvider, 'maystro');
  assert.equal(events[0].sourceEventType, 'OrderDelivered');
  assert.equal(events[0].sourceOccurredAt, '2026-10-20T08:12:13.000Z');
  assert.ok(events[2].description?.includes('ملاحظة شركة التوصيل: Livré'));
  assert.deepEqual(events[0].carrierMetadata?.['wilaya'], 'Alger');
  assert.equal((events[0].carrierMetadata?.['products'] as unknown[]).length, 2);
});

test('uses a stable key for snapshot events without provider history', () => {
  const first = MaystroAdapter.normalizeOrderHistory(
    'merchant-1',
    orderFixture({ status: 31, updated_at: '2026-10-22T10:05:00+01:00' }),
    [],
  );
  const second = MaystroAdapter.normalizeOrderHistory(
    'merchant-1',
    orderFixture({ status: 31, updated_at: '2026-10-23T10:05:00+01:00' }),
    [],
  );

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].sourceEventId, second[0].sourceEventId);
});

test('uses Maystro internal UUID as a stable fallback when external_order_id is absent', () => {
  const events = MaystroAdapter.normalizeOrderHistory(
    'merchant-1',
    orderFixture({ external_order_id: null }),
    [{ status: 4, created_at: '2026-10-20T09:12:13+01:00' }]
  );

  assert.equal(events[0].externalOrderId, '172316976800001');
});

test('parses DeliveryInfoUpdated and accepts a Maystro test dictionary sent as raw JSON', () => {
  const deliveryInfo = parseMaystroWebhookEnvelope(JSON.stringify({
    event: 'DeliveryInfoUpdated',
    payload: { order_id: '172316976800001' },
  }));
  assert.equal(deliveryInfo.eventType, 'DeliveryInfoUpdated');
  assert.equal(deliveryInfo.orderId, '172316976800001');

  const testDictionary = parseMaystroWebhookEnvelope(JSON.stringify({ test: true, message: 'webhook check' }));
  assert.equal(testDictionary.eventType, '');
  assert.equal(testDictionary.orderId, null);
});

test('keeps the legacy Maystro webhook normalizer compatible with array payloads and French statuses', () => {
  const event = MaystroAdapter.normalize('merchant-1', [{
    id: orderId,
    tracking_id: '172316976800001',
    external_order_id: 'STORE-ORDER-77',
    customer_name: 'Client',
    customer_phone: '0555123456',
    product: 'Sac',
    status: 'ramasse',
  }]);

  assert.equal(event.externalOrderId, 'STORE-ORDER-77');
  assert.equal(event.carrierOrderId, orderId);
  assert.equal(event.statusRaw, 'dispatched');
  assert.equal(event.productName, 'Sac');
});
