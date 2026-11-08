import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeZimouStatusResponse } from '../zimou-sync.js';

test('normalizes Zimou tracking-code status maps from wrapped and plain responses', () => {
  const rows = { 'ZM-1': { status_id: 8 } };
  assert.deepEqual(normalizeZimouStatusResponse({ data: rows }), rows);
  assert.deepEqual(normalizeZimouStatusResponse(rows), rows);
  assert.deepEqual(normalizeZimouStatusResponse([]), {});
});
