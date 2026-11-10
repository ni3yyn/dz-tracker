import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProcolisTrackingPayload, extractProcolisOrder } from '../procolis-sync.js';

test('extracts a Procolis parcel from the documented Colis response envelope', () => {
  const parcel = { Tracking: 'PR-123456', Situation: 'En transit' };
  assert.deepEqual(extractProcolisOrder({ Colis: [parcel] }), parcel);
});

test('returns null when Procolis has no parcel for a tracking number', () => {
  assert.equal(extractProcolisOrder({ Colis: [] }), null);
  assert.equal(extractProcolisOrder(null), null);
  assert.equal(extractProcolisOrder('null'), null);
});

test('supports a direct single-parcel response', () => {
  const parcel = { Tracking: 'PR-123456', Situation: 'Livré' };
  assert.deepEqual(extractProcolisOrder(parcel), parcel);
});

test('fills missing parcel identity and customer fields from the matched TajerTrack order', () => {
  const payload = buildProcolisTrackingPayload(
    { Situation: 'En transit' },
    'PR-123456',
    {
      external_order_id: 'STORE-ORDER-42',
      customer_name: 'Customer Name',
      customer_phone: '0555123456',
      product_name: 'Product title',
      carrier_tracking_number: 'PR-123456',
      current_status: 'in_transit',
    }
  );

  assert.equal(payload.Tracking, 'PR-123456');
  assert.equal(payload.id_Externe, 'STORE-ORDER-42');
  assert.equal(payload.Client, 'Customer Name');
  assert.equal(payload.MobileA, '0555123456');
  assert.equal(payload.TProduit, 'Product title');
  assert.equal(payload.Situation, 'En transit');
});

test('does not overwrite actual Procolis customer fields with stale TajerTrack values', () => {
  const payload = buildProcolisTrackingPayload(
    { Tracking: 'PR-123456', Client: 'Updated Name', MobileA: '0666123456', TProduit: 'Updated Product' },
    'PR-123456',
    {
      external_order_id: 'STORE-ORDER-42',
      customer_name: 'Old Name',
      customer_phone: '0555123456',
      product_name: 'Old Product',
      carrier_tracking_number: 'PR-123456',
      current_status: 'in_transit',
    }
  );

  assert.equal(payload.Client, 'Updated Name');
  assert.equal(payload.MobileA, '0666123456');
  assert.equal(payload.TProduit, 'Updated Product');
});
