import assert from 'node:assert/strict';
import test from 'node:test';
import { ProcolisAdapter } from '../carriers/zrexpress.adapter.js';

test('normalizes Procolis shipments with a separate provider identity from ZR Express', () => {
  const event = ProcolisAdapter.normalize('merchant-1', {
    Tracking: 'PR-123456',
    id_Externe: 'STORE-ORDER-42',
    Client: 'Customer Name',
    MobileA: '0555123456',
    TProduit: 'Product title',
    Situation: 'En transit',
    TypeLivraison: '0',
  });

  assert.equal(event.merchantId, 'merchant-1');
  assert.equal(event.externalOrderId, 'STORE-ORDER-42');
  assert.equal(event.carrierTrackingNumber, 'PR-123456');
  assert.equal(event.customerName, 'Customer Name');
  assert.equal(event.customerPhone, '213555123456');
  assert.equal(event.productName, 'Product title');
  assert.equal(event.carrierName, 'Procolis');
  assert.equal(event.sourceProvider, 'procolis');
  assert.equal(event.statusRaw, 'in_transit');
  assert.match(event.description || '', /Procolis/);
  assert.doesNotMatch(event.description || '', /ZR Express/);
});
