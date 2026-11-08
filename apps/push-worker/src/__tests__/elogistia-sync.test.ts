import assert from 'node:assert/strict';
import test from 'node:test';
import { createElogistiaEventId, normalizeElogistiaHistory } from '../elogistia-sync.js';

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
});
