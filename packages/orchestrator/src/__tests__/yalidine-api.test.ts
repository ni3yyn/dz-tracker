import assert from 'node:assert/strict';
import test from 'node:test';
import {
  YalidineApiError,
  buildYalidineCreateParcelData,
  createYalidineParcel,
  estimateYalidineFees,
  findYalidineParcelsByOrderId,
  getYalidineFeeQuote,
  getYalidineManualParcelOptions,
  normalizeYalidineApiBaseUrl,
  type YalidineCreateParcelData,
} from '../carriers/yalidine-api.js';

const credentials = { apiId: '1234567890123456', apiToken: 'test-token-value-that-is-not-real' };
const baseUrl = 'https://api.guepex.app/v1/';
function sampleInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'TT-ORDER-42', firstName: 'Brahim', lastName: 'Mohamed',
    phone: '0550123456', phone2: '', address: 'حي 1200 مسكن، المدخل 2',
    fromWilayaName: 'Alger', toWilayaName: 'Blida', toCommuneName: 'Blida',
    productDescription: 'Machine à café × 2, filtre inox × 1',
    amountToCollect: 4500, declaredValue: 4200, insurance: false,
    length: 30, width: 20, height: 10, weight: 2,
    deliveryFeePayer: 'receiver' as const, stopDesk: false, hasExchange: false,
    ...overrides,
  };
}
function response(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
}

test('allows only official Yalidine and Guepex HTTPS API hosts', () => {
  assert.equal(normalizeYalidineApiBaseUrl(baseUrl).toString(), baseUrl);
  assert.equal(normalizeYalidineApiBaseUrl('https://api.yalidine.app/v1').toString(), 'https://api.yalidine.app/v1/');
  assert.throws(() => normalizeYalidineApiBaseUrl('http://api.guepex.app/v1/'), YalidineApiError);
  assert.throws(() => normalizeYalidineApiBaseUrl('https://evil.example/v1/'), YalidineApiError);
  assert.throws(() => normalizeYalidineApiBaseUrl('https://api.guepex.app:8443/v1/'), YalidineApiError);
});

test('maps the complete shipment form to the API contract without fake dimensions', () => {
  const parcel = buildYalidineCreateParcelData(sampleInput({
    phone: '+213 550 123 456', phone2: '0660 123 456', deliveryFeePayer: 'sender',
    insurance: true, hasExchange: true, productToCollect: 'Ancien téléphone',
    openingDecision: 'accept', economic: true,
  }));
  assert.deepEqual(parcel, {
    order_id: 'TT-ORDER-42', from_wilaya_name: 'Alger',
    firstname: 'Brahim', familyname: 'Mohamed',
    contact_phone: '0550123456,0660123456', address: 'حي 1200 مسكن، المدخل 2',
    to_commune_name: 'Blida', to_wilaya_name: 'Blida',
    product_list: 'Machine à café × 2, filtre inox × 1',
    price: 4500, do_insurance: true, declared_value: 4200,
    length: 30, width: 20, height: 10, weight: 2,
    freeshipping: true, is_stopdesk: false, has_exchange: true,
    product_to_collect: 'Ancien téléphone', opening_decision: 'accept', economic: true,
  });
});

test('requires a carrier center for stopdesk and omits stopdesk_id for home delivery', () => {
  assert.throws(() => buildYalidineCreateParcelData(sampleInput({ stopDesk: true })), YalidineApiError);
  const desk = buildYalidineCreateParcelData(sampleInput({ stopDesk: true, stopDeskId: '163001' }));
  assert.equal(desk.stopdesk_id, 163001);
  assert.equal('stopdesk_id' in buildYalidineCreateParcelData(sampleInput()), false);
});

test('rejects invalid full-form values before contacting the carrier', () => {
  for (const overrides of [
    { amountToCollect: 150001 }, { amountToCollect: 12.5 }, { declaredValue: -1 },
    { phone: '0********6' }, { phone2: '0550123456' }, { weight: -1 },
    { length: 1.5 }, { width: 501 }, { firstName: '' }, { lastName: '' },
    { address: '' }, { productDescription: '' }, { hasExchange: true, productToCollect: '' },
  ]) assert.throws(() => buildYalidineCreateParcelData(sampleInput(overrides)), YalidineApiError);
});

test('finds an existing parcel by exact merchant reference without using masked GET PII', async () => {
  let requestedUrl = '';
  let requestedHeaders: Headers | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = new Headers(init?.headers);
    return response({ data: [
      { order_id: 'TT-ORDER-42', tracking: 'yal-42ABC', label: 'https://guepex.app/label/42', import_id: 42, contact_phone: 'masked' },
      { order_id: 'OTHER-ORDER', tracking: 'yal-other' },
    ] });
  };
  const matches = await findYalidineParcelsByOrderId(baseUrl, credentials, 'TT-ORDER-42', fetchImpl);
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/v1/parcels/');
  assert.equal(url.searchParams.get('order_id'), 'TT-ORDER-42');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tracking, 'yal-42ABC');
  assert.equal(requestedHeaders?.get('X-API-ID'), credentials.apiId);
  assert.equal(requestedHeaders?.get('X-API-TOKEN'), credentials.apiToken);
});

test('refuses a matching carrier reference without a confirmed tracking number', async () => {
  await assert.rejects(
    findYalidineParcelsByOrderId(baseUrl, credentials, 'TT-ORDER-42', async () => response({
      data: [{ order_id: 'TT-ORDER-42', tracking: null }],
    })),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'ambiguous'
  );
});

test('posts one complete parcel and returns the carrier-generated tracking number', async () => {
  let requestedUrl = '';
  let init: RequestInit | undefined;
  const parcel = buildYalidineCreateParcelData(sampleInput());
  const created = await createYalidineParcel(baseUrl, credentials, parcel, async (input, options) => {
    requestedUrl = String(input); init = options;
    return response({ [parcel.order_id]: {
      success: true, order_id: parcel.order_id, tracking: 'yal-42ABC',
      import_id: 42, label: 'https://guepex.app/label/42', message: '',
    } });
  });
  const body = JSON.parse(String(init?.body)) as YalidineCreateParcelData[];
  assert.equal(new URL(requestedUrl).pathname, '/v1/parcels/');
  assert.equal(init?.method, 'POST');
  assert.equal(body.length, 1);
  assert.equal(body[0].length, 30);
  assert.equal(body[0].do_insurance, false);
  assert.equal(created.tracking, 'yal-42ABC');
});

test('distinguishes carrier refusal, uncertain POST response and rate-limit guidance', async () => {
  const parcel = buildYalidineCreateParcelData(sampleInput());
  await assert.rejects(createYalidineParcel(baseUrl, credentials, parcel, async () => response({
    [parcel.order_id]: { success: false, tracking: null, message: 'Invalid phone' },
  })), (error: unknown) => error instanceof YalidineApiError && error.kind === 'rejected');
  await assert.rejects(createYalidineParcel(baseUrl, credentials, parcel, async () => response({ success: true })),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'uncertain');
  await assert.rejects(getYalidineManualParcelOptions(baseUrl, credentials, async () =>
    response({ message: 'Too many requests' }, 429, { 'Retry-After': '17' })),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'rate_limited' && error.retryAfterSeconds === 17);
});

test('loads carrier-owned locations and per-commune fees and estimates the real fee components', async () => {
  const paths: string[] = [];
  const locations = await getYalidineManualParcelOptions(baseUrl, credentials, async (input) => {
    const url = new URL(String(input)); paths.push(url.pathname);
    if (url.pathname.endsWith('/wilayas/')) return response({ data: [{ id: 16, name: 'Alger', is_deliverable: 1 }] });
    if (url.pathname.endsWith('/communes/')) return response({ data: [{ id: 901, name: 'Blida', wilaya_id: 9, wilaya_name: 'Blida', is_deliverable: 1, has_stop_desk: 1 }] });
    return response({ data: [{ center_id: 163001, name: 'Centre Blida', address: 'Centre', commune_id: 901, commune_name: 'Blida', wilaya_id: 9, wilaya_name: 'Blida' }] });
  });
  assert.equal(locations.platform, 'guepex');
  assert.deepEqual(paths.sort(), ['/v1/centers/', '/v1/communes/', '/v1/wilayas/']);

  let feeUrl = '';
  const quote = await getYalidineFeeQuote(baseUrl, credentials, 16, 9, 901, async (input) => {
    feeUrl = String(input);
    return response({
      from_wilaya_name: 'Alger', to_wilaya_name: 'Blida', zone: 2,
      retour_fee: 300, cod_percentage: 0.75, insurance_percentage: 0.75, oversize_fee: 100,
      per_commune: { '901': { commune_id: 901, commune_name: 'Blida', express_home: 500, express_desk: 400, economic_home: 350, economic_desk: 300 } },
    });
  });
  const url = new URL(feeUrl);
  assert.equal(url.pathname, '/v1/fees/');
  assert.equal(url.searchParams.get('from_wilaya_id'), '16');
  assert.equal(url.searchParams.get('to_wilaya_id'), '9');
  const estimate = estimateYalidineFees(quote, {
    stopDesk: false, economic: false, amountToCollect: 5000, declaredValue: 6000,
    insured: true, length: 20, width: 20, height: 10, weight: 7,
  });
  assert.equal(estimate.billableWeight, 7);
  assert.equal(estimate.baseDeliveryFee, 500);
  assert.equal(estimate.overweightFee, 200);
  assert.equal(estimate.codFee, 45);
  assert.equal(estimate.insuranceFee, 45);
  assert.equal(estimate.estimatedDeliveryTotal, 790);
  assert.equal(estimate.returnFee, 300);
});
