import assert from 'node:assert/strict';
import test from 'node:test';
import { YalidineAdapter } from '../carriers/yalidine.adapter.js';

test('normalizes Yalidine parcel-created webhook data and preserves provider event identity', () => {
  const event = YalidineAdapter.normalizeWebhookEvent('merchant-1', {
    event_id: 'evt-created-1',
    occurred_at: '2026-11-08 10:30:00',
    type: 'parcel_created',
    data: {
      order_id: 'STORE-ORDER-42',
      tracking: 'YAL-001',
      label: 'Customer parcel',
    },
  });

  assert.equal(event.externalOrderId, 'STORE-ORDER-42');
  assert.equal(event.carrierName, 'Yalidine Express');
  assert.equal(event.carrierTrackingNumber, 'YAL-001');
  assert.equal(event.statusRaw, 'processing');
  assert.equal(event.sourceProvider, 'yalidine');
  assert.equal(event.sourceEventId, 'yalidine:evt-created-1');
  assert.equal(event.sourceEventType, 'parcel_created');
  assert.equal(event.sourceOccurredAt, '2026-11-08T09:30:00.000Z');
});

test('normalizes status updates by tracking number when no store order reference is sent', () => {
  const event = YalidineAdapter.normalizeWebhookEvent('merchant-1', {
    event_id: 'evt-status-2',
    occurred_at: '2026-11-08T11:45:00+01:00',
    type: 'parcel_status_updated',
    data: {
      tracking: 'YAL-002',
      status: 'Livrée',
      reason: 'Remis au client',
    },
  });

  assert.equal(event.externalOrderId, 'YAL-002');
  assert.equal(event.carrierTrackingNumber, 'YAL-002');
  assert.equal(event.statusRaw, 'delivered');
  assert.equal(event.sourceOccurredAt, '2026-11-08T10:45:00.000Z');
});

test('rejects non-tracking Yalidine events from the tracking adapter', () => {
  assert.throws(() => YalidineAdapter.normalizeWebhookEvent('merchant-1', {
    event_id: 'evt-payment-3',
    occurred_at: '2026-11-08 12:00:00',
    type: 'parcel_payment_updated',
    data: { tracking: 'YAL-003', status: 'payed' },
  }));
});

test('rejects invalid provider event timestamps', () => {
  assert.throws(() => YalidineAdapter.normalizeWebhookEvent('merchant-1', {
    event_id: 'evt-invalid-4',
    occurred_at: 'not-a-date',
    type: 'parcel_created',
    data: { tracking: 'YAL-004' },
  }));
});


test('extracts unmasked recipient and parcel details when Guepex includes them in webhook data', () => {
  const event = YalidineAdapter.normalizeWebhookEvent('merchant-1', {
    event_id: 'evt-created-rich-1',
    occurred_at: '2026-11-15 10:30:00',
    type: 'parcel_created',
    data: {
      order_id: 'STORE-ORDER-77',
      tracking: 'yal-077AAA',
      firstname: 'Brahim',
      familyname: 'Mohamed',
      contact_phone: '0550123456',
      product_list: 'Machine à café',
      import_id: 233,
      price: 2400,
      delivery_fee: 500,
      to_wilaya_name: 'Alger',
      to_commune_name: 'Bordj El Kiffan',
      last_status: 'Pas encore expédié',
      label: 'https://guepex.app/app/bordereau.php?tracking=yal-077AAA',
    },
  });

  assert.equal(event.customerName, 'Brahim Mohamed');
  assert.equal(event.customerPhone, '213550123456');
  assert.equal(event.productName, 'Machine à café');
  assert.equal(event.carrierMetadata?.import_id, 233);
  assert.equal(event.carrierMetadata?.delivery_fee, 500);
  assert.equal(event.carrierMetadata?.to_wilaya_name, 'Alger');
});

test('does not treat a masked Guepex phone as a deliverable customer number', () => {
  const event = YalidineAdapter.normalizeWebhookEvent('merchant-1', {
    event_id: 'evt-created-masked-1',
    occurred_at: '2026-11-15 10:30:00',
    type: 'parcel_created',
    data: {
      order_id: 'STORE-ORDER-78',
      tracking: 'yal-078AAA',
      firstname: 'M*****d',
      familyname: 'E* A****',
      contact_phone: '0********9',
    },
  });

  assert.equal(event.customerName, undefined);
  assert.equal(event.customerPhone, undefined);
});
