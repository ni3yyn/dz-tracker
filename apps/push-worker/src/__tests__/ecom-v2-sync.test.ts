import assert from 'node:assert/strict';
import test from 'node:test';
import { createEcomV2EventId } from '../ecom-v2-sync.js';

test('creates deterministic tracking-scoped E-com v2 history identifiers', () => {
  const event = { date: '2026-11-08 10:30:00', situation: 'Livrée', commentaire: 'Remis au client' };
  assert.equal(createEcomV2EventId('ECOM-1', event), createEcomV2EventId('ECOM-1', event));
  assert.notEqual(createEcomV2EventId('ECOM-1', event), createEcomV2EventId('ECOM-2', event));
  assert.notEqual(createEcomV2EventId('ECOM-1', event), createEcomV2EventId('ECOM-1', { ...event, commentaire: 'Autre événement' }));
});
