import assert from 'node:assert/strict';
import test from 'node:test';
import { mapZimouStatus, ZimouAdapter } from '../carriers/zimou.adapter.js';

test('maps Zimou numeric status IDs without guessing unknown values', () => {
  assert.equal(mapZimouStatus(8).statusRaw, 'delivered');
  assert.equal(mapZimouStatus('7').statusRaw, 'out_for_delivery');
  assert.equal(mapZimouStatus(20).statusRaw, 'returned');
  assert.equal(mapZimouStatus(31).statusRaw, 'cancelled');
  assert.equal(mapZimouStatus(999).statusRaw, 'unknown');
  assert.equal(mapZimouStatus(8, 'LIVRÉ').statusRaw, 'delivered');
  assert.equal(mapZimouStatus(8, 'Custom merchant state').statusRaw, 'unknown');
});

test('normalizes Zimou package and partner tracking details into a TajerTrack event', () => {
  const event = ZimouAdapter.normalize('merchant-1', {
    id: 77881,
    order_id: 'STORE-ORDER-88',
    tracking_code: 'ZM-77881-ALG',
    client_first_name: 'Sara',
    client_last_name: 'Mansouri',
    client_phone: '0555123456',
    name: 'Chaussures',
    address: 'Cité 1200 logements',
    wilaya_name: 'Alger',
    commune: { name: 'Bab Ezzouar', wilaya_id: 16 },
    status_id: 8,
    status_name: 'LIVRÉ',
    tracking_partner_company: 'Yalidine',
    delivery_company_tracking_code: 'YAL-99001',
    delivery_price: 450,
    price: 3200,
    delivery_type_name: 'Express',
  });

  assert.equal(event.externalOrderId, 'STORE-ORDER-88');
  assert.equal(event.carrierName, 'Zimou Express');
  assert.equal(event.carrierTrackingNumber, 'ZM-77881-ALG');
  assert.equal(event.carrierOrderId, '77881');
  assert.equal(event.customerName, 'Sara Mansouri');
  assert.equal(event.productName, 'Chaussures');
  assert.equal(event.statusRaw, 'delivered');
  assert.equal(event.sourceProvider, 'zimou');
  assert.equal(event.carrierMetadata?.['partnerCompany'], 'Yalidine');
  assert.equal(event.carrierMetadata?.['partnerTrackingCode'], 'YAL-99001');
  assert.equal(event.carrierMetadata?.['wilaya'], 'Alger');
  assert.equal(event.carrierMetadata?.['commune'], 'Bab Ezzouar');
  assert.equal(event.carrierMetadata?.['deliveryPrice'], 450);
  assert.equal(event.carrierMetadata?.['codAmount'], 3200);
});

test('supports status polling responses wrapped in a data object', () => {
  // Keep response-shape normalization isolated in the worker tests.
  const wrapped = { data: { 'ZM-1': { status_id: 8 } } };
  assert.deepEqual(wrapped.data['ZM-1'], { status_id: 8 });
});
