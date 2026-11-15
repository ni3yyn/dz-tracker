import assert from 'node:assert/strict';
import test from 'node:test';
import { parseElogistiaWilayas } from '../carriers/elogistia-locations.js';

const feeGrid = [
  { wilayaID: 1, wilayaLabel: 'Adrar', home: '900', stopdesk: '600' },
  { wilayaID: 16, wilayaLabel: 'Alger', home: '500', stopdesk: '300' },
];

test('parses Elogistia getShippingCost wilaya rows', () => {
  assert.deepEqual(parseElogistiaWilayas(feeGrid), [
    { id: '1', name: 'Adrar', homeFee: '900', stopDeskFee: '600' },
    { id: '16', name: 'Alger', homeFee: '500', stopDeskFee: '300' },
  ]);
});

test('unwraps common API response envelopes', () => {
  assert.deepEqual(parseElogistiaWilayas({ body: feeGrid }), parseElogistiaWilayas(feeGrid));
  assert.deepEqual(parseElogistiaWilayas({ data: { data: feeGrid } }), parseElogistiaWilayas(feeGrid));
  assert.deepEqual(parseElogistiaWilayas({ result: { wilayas: feeGrid } }), parseElogistiaWilayas(feeGrid));
});

test('accepts compatible aliases but rejects invalid and duplicate rows', () => {
  assert.deepEqual(parseElogistiaWilayas([
    { code: '16', name: 'Alger' },
    { wilaya_id: '16', wilaya_name: 'Algiers duplicate' },
    { wilayaID: '0', wilayaLabel: 'Invalid zero' },
    { wilayaID: '17', wilayaLabel: '' },
    { wilayaID: '18', wilayaLabel: 'No numeric id' },
    { wilayaID: 'x', wilayaLabel: 'Invalid id' },
  ]), [{ id: '16', name: 'Alger' }]);
});

test('returns an empty list for provider errors and malformed responses', () => {
  assert.deepEqual(parseElogistiaWilayas({ Message: 'Votre apiKey n\'est pas valide' }), []);
  assert.deepEqual(parseElogistiaWilayas({ error: 'fee not found.0' }), []);
  assert.deepEqual(parseElogistiaWilayas(null), []);
  assert.deepEqual(parseElogistiaWilayas([{ home: '500', stopdesk: '300' }]), []);
});
