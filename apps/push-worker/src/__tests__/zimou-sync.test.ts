import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeZimouStatusResponse, normalizeZimouPackageStatuses } from '../zimou-sync.js';

test('normalizes Zimou tracking-code status maps from wrapped and plain responses', () => {
  const rows = { 'ZM-1': { status_id: 8 } };
  assert.deepEqual(normalizeZimouStatusResponse({ data: rows }), rows);
  assert.deepEqual(normalizeZimouStatusResponse(rows), rows);
  assert.deepEqual(normalizeZimouStatusResponse([]), {});
});

test('normalizes the merchant-specific Zimou status dictionary', () => {
  assert.deepEqual(normalizeZimouPackageStatuses({ data: [{ id: 8, name: 'LIVRÉ' }, { id: 12, name: 'EN ATTENTE' }, { id: null, name: '' }] }), {
    '8': 'LIVRÉ',
    '12': 'EN ATTENTE',
  });
});
