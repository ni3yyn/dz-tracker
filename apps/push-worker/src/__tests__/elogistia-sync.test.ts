import assert from 'node:assert/strict';
import test from 'node:test';
import { createElogistiaEventId, normalizeElogistiaHistory, normalizeElogistiaOrderForImport, normalizeElogistiaOrderList } from '../elogistia-sync.js';

test('normalizes wrapped, plain-array and plain-object tracking history', () => {
  const event = { Date: '08/11/2026 10:30:00', Statut: 'Livré', Log: 'Remis au client' };
  assert.deepEqual(normalizeElogistiaHistory({ body: [event] }), [event]);
  assert.deepEqual(normalizeElogistiaHistory({ data: { data: [event] } }), [event]);
  assert.deepEqual(normalizeElogistiaHistory(event), [event]);
  assert.deepEqual(normalizeElogistiaHistory({ body: { message: 'no history' } }), []);
});

test('generates stable, tracking-scoped identifiers for history events', () => {
  const event = { Date: '08/11/2026 10:30:00', Statut: 'Livré', Log: 'Remis au client' };
  assert.equal(createElogistiaEventId('ELO-1', event), createElogistiaEventId('ELO-1', event));
  assert.notEqual(createElogistiaEventId('ELO-1', event), createElogistiaEventId('ELO-2', event));
  assert.notEqual(createElogistiaEventId('ELO-1', event), createElogistiaEventId('ELO-1', { ...event, Log: 'Autre journal' }));
  assert.notEqual(
    createElogistiaEventId('ELO-1', { ...event, logID: 101 }),
    createElogistiaEventId('ELO-1', { ...event, logID: 102 }),
  );
});


test('normalizes the documented account-wide getOrders response', () => {
  const rows = [
    { name: 'Amine', firstname: 'Salhi', 'id de client': 8, suivi: 'ELO-51624080976', 'Téléphone': '0555555555', 'Validation Elogistia': 5 },
    { name: 'Sabri', firstname: 'Nadjib', 'id de client': 8, suivi: 'ELO-51624081499', 'Validation Elogistia': 3 },
  ];
  assert.deepEqual(normalizeElogistiaOrderList({ body: rows, itemCount: 2 }), rows);
  assert.deepEqual(normalizeElogistiaOrderList({ data: { data: rows } }), rows);
  assert.deepEqual(normalizeElogistiaOrderList({ body: [] }), []);
});

test('creates a safe account-order snapshot using suivi, not the shared client ID', () => {
  const snapshot = normalizeElogistiaOrderForImport({
    name: 'Amine',
    firstname: 'Salhi',
    'id de client': 8,
    suivi: 'ELO-51624080976',
    address: 'City des annassers 2 bt 6 N 10',
    'E-mail': 'customer@example.test',
    'Téléphone': '0555555555',
    'Commuhne ': 2,
    'Frais de livraison': 1100,
    'Validation Elogistia': 5,
  });
  assert.ok(snapshot);
  assert.equal(snapshot?.tracking, 'ELO-51624080976');
  assert.equal(snapshot?.IdCommande, 'ELO-51624080976');
  assert.equal(snapshot?.customer_name, 'Salhi Amine');
  assert.equal(snapshot?.phone, '0555555555');
  assert.equal(snapshot?.Statut, 'pending');
  assert.equal(snapshot?.order_snapshot, true);
  assert.equal(snapshot?.source_event_type, 'order_discovery');
  assert.equal(snapshot?.suppressTriggers, true);
  assert.notEqual(snapshot?.IdCommande, 8);
  assert.equal(normalizeElogistiaOrderForImport({ name: 'No tracking number' }), null);
});
