import assert from 'node:assert/strict';
import test from 'node:test';
import { ElogistiaAdapter, mapElogistiaStatus, parseElogistiaDate } from '../carriers/elogistia.adapter.js';

test('maps documented Elogistia French statuses without guessing unknown labels', () => {
  assert.equal(mapElogistiaStatus('Livré').statusRaw, 'delivered');
  assert.equal(mapElogistiaStatus('Livrée & réglée').statusRaw, 'delivered');
  assert.equal(mapElogistiaStatus('En cours livraison').statusRaw, 'out_for_delivery');
  assert.equal(mapElogistiaStatus('En cours de livraison').statusRaw, 'out_for_delivery');
  assert.equal(mapElogistiaStatus('En cours de ramassage').statusRaw, 'processing');
  assert.equal(mapElogistiaStatus('À ramasser').statusRaw, 'processing');
  assert.equal(mapElogistiaStatus('Ramassage à relancer').statusRaw, 'attempt_failed');
  assert.equal(mapElogistiaStatus('En hub').statusRaw, 'at_local_hub');
  assert.equal(mapElogistiaStatus('Suspendue').statusRaw, 'postponed');
  assert.equal(mapElogistiaStatus('Ramassée').statusRaw, 'dispatched');
  assert.equal(mapElogistiaStatus('En transit').statusRaw, 'in_transit');
  assert.equal(mapElogistiaStatus('Retour en transit').statusRaw, 'returning');
  assert.equal(mapElogistiaStatus('Retour remis').statusRaw, 'returned');
  assert.equal(mapElogistiaStatus('Annulée').statusRaw, 'cancelled');
  assert.equal(mapElogistiaStatus('Annulé').statusRaw, 'cancelled');
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


test('imports Elogistia draft snapshots without treating them as dispatched', () => {
  const event = ElogistiaAdapter.normalize('merchant-1', {
    suivi: 'ELO-DRAFT-1',
    IdCommande: 'ELO-DRAFT-1',
    customer_name: 'Salhi Amine',
    phone: '0555555555',
    Statut: 'Brouillon',
    'Validation Elogistia': 5,
    'E-mail': 'customer@example.test',
    address: 'Algiers',
    'Commuhne ': 2,
    'Frais de livraison': 1100,
    order_snapshot: true,
    source_event_type: 'order_discovery',
    suppressTriggers: true,
  });

  assert.equal(event.statusRaw, 'processing');
  assert.match(event.statusTitle || '', /مسودة/);
  assert.equal(event.carrierTrackingNumber, 'ELO-DRAFT-1');
  assert.equal(event.sourceEventType, 'order_discovery');
  assert.equal(event.suppressTriggers, true);
  assert.equal((event.carrierMetadata?.elogistiaOrderSnapshot as any)?.validationElogistia, 5);
  assert.equal((event.carrierMetadata?.elogistiaOrderSnapshot as any)?.address, 'Algiers');
});


test('normalizes the exact Elogistia cancellation history label into a cancelled order update', () => {
  const event = ElogistiaAdapter.normalize('merchant-1', {
    tracking: 'ELO-CANCEL-1',
    IdCommande: 'STORE-ORDER-CANCEL-1',
    Date: '15/11/2026 16:05:00',
    Statut: 'Annulé',
    Tracking: 'ELO-CANCEL-1',
    logID: 85156866,
  });

  assert.equal(event.externalOrderId, 'STORE-ORDER-CANCEL-1');
  assert.equal(event.carrierTrackingNumber, 'ELO-CANCEL-1');
  assert.equal(event.statusRaw, 'cancelled');
  assert.match(event.statusTitle || '', /إلغاء/);
  assert.equal(event.sourceProvider, 'elogistia');
});
