import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderEvent,
  carrierNameFromBaseUrl,
  getLatestMeaningfulActivity,
  buildStatusEvent,
  getRows,
  getStatusMap,
} from '../ecotrack-sync.js';

test('parses the official EcoTrack paginated get/orders response', () => {
  const row = {
    tracking: 'ECTEST0001',
    reference: 'STORE-1042',
    client: 'Ahmed Test',
    phone: '0550123456',
    products: 'Test product',
    status: 'prete_a_expedier',
    created_at: '2026-11-08',
  };

  const rows = getRows({
    current_page: 1,
    data: [row],
    last_page: 1,
    per_page: 40,
    total: 1,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tracking, 'ECTEST0001');

  const event = buildOrderEvent(rows[0]!, 'DHD');
  assert.equal(event?.tracking, 'ECTEST0001');
  assert.equal(event?.reference, 'STORE-1042');
  assert.equal(event?.client, 'Ahmed Test');
  assert.equal(event?.phone, '0550123456');
  assert.equal(event?.products, 'Test product');
  assert.equal(event?.status, 'prete_a_expedier');
  assert.equal(event?.carrier_name, 'DHD');
});

test('rejects malformed shipment-list containers instead of inventing rows', () => {
  assert.deepEqual(getRows(null), []);
  assert.deepEqual(getRows({ data: { tracking: 'ECTEST0001' } }), []);
  assert.deepEqual(getRows({ data: [null, 1, 'invalid'] }), []);
});

test('reads the official get/orders/status data map keyed by tracking number', () => {
  const response = {
    data: {
      ECTEST0001: {
        status: 'notification_on_order',
        activity: [
          { status: 'vers_hub', reason: 'En route vers le centre', date: '2026-11-08', time: '11:00:00' },
          { status: 'notification_on_order', reason: 'Client absent', date: '2026-11-08', time: '12:00:00' },
        ],
      },
    },
  };
  const map = getStatusMap(response);
  assert.equal(map.ECTEST0001.status, 'notification_on_order');
  assert.equal(map.UNKNOWN, undefined);
});

test('identifies known EcoTrack tenants and readable custom tenant names', () => {
  assert.equal(carrierNameFromBaseUrl('https://platform.dhd-dz.com'), 'DHD');
  assert.equal(carrierNameFromBaseUrl('https://app.conexlog-dz.com'), 'Conexlog');
  assert.equal(carrierNameFromBaseUrl('https://rocketdelivery.ecotrack.dz'), 'Rocket Delivery');
  assert.equal(carrierNameFromBaseUrl('https://custom-express.ecotrack.dz'), 'Custom Express');
});


test('keeps the last real EcoTrack activity when notification_on_order is appended', () => {
  const activity = [
    { status: 'vers_hub', reason: 'En route vers le centre', date: '2026-11-08', time: '11:00:00' },
    { status: 'notification_on_order', reason: 'Client absent', date: '2026-11-08', time: '12:00:00' },
  ];
  assert.equal(getLatestMeaningfulActivity(activity)?.status, 'vers_hub');

  const event = buildStatusEvent(
    { external_order_id: 'STORE-1042', customer_name: 'Ahmed', customer_phone: '0550123456', product_name: 'Test' },
    { status: 'notification_on_order', activity },
    'ECTEST0001',
    'DHD'
  );
  assert.equal(event?.status, 'vers_hub');
  assert.equal(event?.reason, 'En route vers le centre');
});

test('does not convert a standalone EcoTrack notification into a shipment status', () => {
  const event = buildStatusEvent(
    { external_order_id: 'STORE-1042' },
    { status: 'notification_on_order', activity: [{ status: 'notification_on_order', reason: 'Client absent' }] },
    'ECTEST0001',
    'DHD'
  );
  assert.equal(event, null);
});
