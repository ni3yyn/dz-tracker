import assert from 'node:assert/strict';
import test from 'node:test';
import { ElogistiaAdapter, mapElogistiaStatus, parseElogistiaDate } from '../carriers/elogistia.adapter.js';

test('maps documented Elogistia French statuses without guessing unknown labels', () => {
  assert.equal(mapElogistiaStatus('Livré').statusRaw, 'delivered');
  assert.equal(mapElogistiaStatus('Livrée & réglée').statusRaw, 'delivered');
  assert.equal(mapElogistiaStatus('En cours livraison').statusRaw, 'out_for_delivery');
  assert.equal(mapElogistiaStatus('Ramassée').statusRaw, 'dispatched');
  assert.equal(mapElogistiaStatus('En transit').statusRaw, 'in_transit');
  assert.equal(mapElogistiaStatus('Retour en transit').statusRaw, 'returning');
  assert.equal(mapElogistiaStatus('Retour remis').statusRaw, 'returned');
  assert.equal(mapElogistiaStatus('Annulée').statusRaw, 'cancelled');
  assert.equal(mapElogistiaStatus('Custom status').statusRaw, 'unknown');
});

test('normalizes an Elogistia tracking history event to the merchant order', () => {
  const event = ElogistiaAdapter.normalize('merchant-1', {
    tracking: 'ELO-00123',
    IdCommande: 'STORE-ORDER-123',
    Date: '08/11/2026 10:30:00',
    Statut: 'Livrée & réglée',
    Log: 'Remis au client',
    customer_name: 'Sara Mansouri',
    phone: '0555123456',
    product_name: 'Sac à main',
    suppressTriggers: true,
  });

  assert.equal(event.merchantId, 'merchant-1');
  assert.equal(event.externalOrderId, 'STORE-ORDER-123');
  assert.equal(event.carrierName, 'Elogistia');
  assert.equal(event.carrierTrackingNumber, 'ELO-00123');
  assert.equal(event.customerName, 'Sara Mansouri');
  assert.equal(event.statusRaw, 'delivered');
  assert.equal(event.sourceProvider, 'elogistia');
  assert.equal(event.suppressTriggers, true);
  assert.equal(event.sourceOccurredAt, '2026-11-08T09:30:00.000Z');
  assert.equal(event.carrierMetadata?.['elogistiaTrackingNumber'], 'ELO-00123');
});

test('parses provider dates and leaves unknown dates unset', () => {
  assert.equal(parseElogistiaDate('08/11/2026 10:30:00'), '2026-11-08T09:30:00.000Z');
  assert.equal(parseElogistiaDate('2026-11-08 10:30:00'), '2026-11-08T09:30:00.000Z');
  assert.equal(parseElogistiaDate('not a date'), undefined);
});
