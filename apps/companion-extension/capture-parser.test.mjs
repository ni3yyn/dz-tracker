import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./capture-parser.js', import.meta.url), 'utf8');
const context = { TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Date, Set, Map, Object, String, Number, Array, globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context);
const parser = context.TTCompanionParser;

function rawBody(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return { raw: [{ bytes }] };
}

test('extracts unmasked customer identity from parcel creation request', () => {
  const result = parser.extractParcelIdentity(rawBody({
    order_id: 'TT-1042', firstname: 'Amine', familyname: 'B.', contact_phone: '0550123456',
    product_name: 'Chaussures'
  }));
  assert.equal(result.orderId, 'TT-1042');
  assert.equal(result.customerName, 'Amine B.');
  assert.equal(result.customerPhone, '0550123456');
  assert.equal(result.productName, 'Chaussures');
});

test('retains an unmasked name fragment and discards masked phone', () => {
  const result = parser.extractParcelIdentity(rawBody({
    order_id: 'TT-1043', firstname: 'N*****', familyname: 'Benali', contact_phone: '0********6'
  }));
  assert.equal(result.customerName, 'Benali');
  assert.equal(result.customerPhone, '');
});

test('retains a real name when the phone is masked', () => {
  const result = parser.extractParcelIdentity(rawBody({
    order_id: 'TT-1044', customer_name: 'Nadia', contact_phone: '0********6'
  }));
  assert.equal(result.customerPhone, '');
  assert.equal(result.customerName, 'Nadia');
});

test('ignores requests without an order reference or usable identity', () => {
  assert.equal(parser.extractParcelIdentity(rawBody({ firstname: 'Amine', contact_phone: '0550123456' })), null);
  assert.equal(parser.extractParcelIdentity(rawBody({ order_id: 'TT-1045', contact_phone: '0*******' })), null);
});

test('supports form data request bodies', () => {
  const result = parser.extractParcelIdentity({ formData: {
    order_id: ['TT-1046'], customer_name: ['Sara'], contact_phone: ['0661234567']
  } });
  assert.equal(result.customerName, 'Sara');
  assert.equal(result.customerPhone, '0661234567');
});
