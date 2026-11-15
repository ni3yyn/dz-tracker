import assert from 'node:assert/strict';
import test from 'node:test';
import {
  YalidineApiError,
  buildYalidineCreateParcelData,
  createYalidineParcel,
  findYalidineParcelsByOrderId,
  getYalidineManualParcelOptions,
  normalizeYalidineApiBaseUrl,
  type YalidineCreateParcelData,
} from '../carriers/yalidine-api.js';

const credentials = { apiId: '1234567890123456', apiToken: 'test-token-value-that-is-not-real' };
const baseUrl = 'https://api.guepex.app/v1/';

function sampleInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'TT-ORDER-42',
    customerName: 'Brahim Mohamed',
    phone: '0550123456',
    address: 'حي 1200 مسكن، المدخل 2',
    fromWilayaName: 'Alger',
    toWilayaName: 'Blida',
    toCommuneName: 'Blida',
    productDescription: 'Machine à café',
    amountToCollect: 4500,
    weight: 2,
    deliveryFeePayer: 'receiver' as const,
    stopDesk: false,
    ...overrides,
  };
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('allows only the official Yalidine and Guepex HTTPS API hosts', () => {
  assert.equal(normalizeYalidineApiBaseUrl(baseUrl).toString(), baseUrl);
  assert.equal(
    normalizeYalidineApiBaseUrl('https://api.yalidine.app/v1').toString(),
    'https://api.yalidine.app/v1/'
  );
  assert.throws(() => normalizeYalidineApiBaseUrl('http://api.guepex.app/v1/'), YalidineApiError);
  assert.throws(() => normalizeYalidineApiBaseUrl('https://evil.example/v1/'), YalidineApiError);
  assert.throws(() => normalizeYalidineApiBaseUrl('https://api.guepex.app:8443/v1/'), YalidineApiError);
});

test('maps TajerTrack order data to the CodFlow Yalidine create parcel contract', () => {
  const parcel = buildYalidineCreateParcelData(sampleInput({
    phone: '+213 550 123 456',
    deliveryFeePayer: 'sender',
  }));

  assert.deepEqual(parcel, {
    order_id: 'TT-ORDER-42',
    from_wilaya_name: 'Alger',
    firstname: 'Brahim',
    familyname: 'Mohamed',
    contact_phone: '0550123456',
    address: 'حي 1200 مسكن، المدخل 2',
    to_commune_name: 'Blida',
    to_wilaya_name: 'Blida',
    product_list: 'Machine à café',
    price: 4500,
    do_insurance: false,
    declared_value: 4500,
    length: 1,
    width: 1,
    height: 1,
    weight: 2,
    freeshipping: true,
    is_stopdesk: false,
    stopdesk_id: null,
    has_exchange: false,
  });
});

test('requires a numeric carrier center for stop-desk delivery', () => {
  assert.throws(
    () => buildYalidineCreateParcelData(sampleInput({ stopDesk: true })),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'rejected'
  );
  const parcel = buildYalidineCreateParcelData(sampleInput({ stopDesk: true, stopDeskId: '163001' }));
  assert.equal(parcel.is_stopdesk, true);
  assert.equal(parcel.stopdesk_id, 163001);
});

test('rejects invalid amount, phone, weight and missing parcel details before contacting Guepex', () => {
  for (const overrides of [
    { amountToCollect: 150001 },
    { amountToCollect: 12.5 },
    { phone: '0********6' },
    { weight: 0 },
    { address: '' },
    { productDescription: '' },
  ]) {
    assert.throws(() => buildYalidineCreateParcelData(sampleInput(overrides)), YalidineApiError);
  }
});

test('looks up existing parcels by exact order_id and uses only safe returned fields', async () => {
  let requestedUrl = '';
  let requestedHeaders: Headers | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedHeaders = new Headers(init?.headers);
    return response({
      has_more: false,
      data: [
        { order_id: 'TT-ORDER-42', tracking: 'yal-42ABC', label: 'https://guepex.app/label/42', import_id: 42, last_status: 'En préparation', contact_phone: 'masked' },
        { order_id: 'OTHER-ORDER', tracking: 'yal-other', label: null },
      ],
    });
  };

  const matches = await findYalidineParcelsByOrderId(baseUrl, credentials, 'TT-ORDER-42', fetchImpl);
  const url = new URL(requestedUrl);

  assert.equal(url.pathname, '/v1/parcels/');
  assert.equal(url.searchParams.get('order_id'), 'TT-ORDER-42');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tracking, 'yal-42ABC');
  assert.equal(matches[0].label, 'https://guepex.app/label/42');
  assert.equal(requestedHeaders?.get('X-API-ID'), credentials.apiId);
  assert.equal(requestedHeaders?.get('X-API-TOKEN'), credentials.apiToken);
});

test('refuses a matching carrier reference without a tracking number', async () => {
  const fetchImpl: typeof fetch = async () => response({
    data: [{ order_id: 'TT-ORDER-42', tracking: null }],
  });
  await assert.rejects(
    findYalidineParcelsByOrderId(baseUrl, credentials, 'TT-ORDER-42', fetchImpl),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'ambiguous'
  );
});

test('creates one live parcel through POST /parcels/ and returns the carrier tracking reference', async () => {
  let requestedUrl = '';
  let requestInit: RequestInit | undefined;
  const parcel = buildYalidineCreateParcelData(sampleInput());
  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return response({
      [parcel.order_id]: {
        success: true,
        order_id: parcel.order_id,
        tracking: 'yal-42ABC',
        import_id: 42,
        label: 'https://guepex.app/app/bordereau.php?tracking=yal-42ABC',
        message: '',
      },
    });
  };

  const created = await createYalidineParcel(baseUrl, credentials, parcel, fetchImpl);
  const submitted = JSON.parse(String(requestInit?.body)) as YalidineCreateParcelData[];

  assert.equal(new URL(requestedUrl).pathname, '/v1/parcels/');
  assert.equal(requestInit?.method, 'POST');
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].order_id, 'TT-ORDER-42');
  assert.equal(created.tracking, 'yal-42ABC');
  assert.equal(created.import_id, 42);
});

test('treats a carrier validation rejection separately from an uncertain creation response', async () => {
  const parcel = buildYalidineCreateParcelData(sampleInput());
  await assert.rejects(
    createYalidineParcel(baseUrl, credentials, parcel, async () => response({
      [parcel.order_id]: { success: false, tracking: null, message: 'Invalid phone' },
    })),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'rejected'
  );

  await assert.rejects(
    createYalidineParcel(baseUrl, credentials, parcel, async () => response({ success: true })),
    (error: unknown) => error instanceof YalidineApiError && error.kind === 'uncertain'
  );
});

test('loads carrier-owned wilayas, communes and stop-desk centers from API responses', async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    urls.push(url.pathname);
    if (url.pathname.endsWith('/wilayas/')) {
      return response({ has_more: false, data: [{ id: 16, name: 'Alger', is_deliverable: 1 }] });
    }
    if (url.pathname.endsWith('/communes/')) {
      return response({ has_more: false, data: [{ id: 1601, name: 'Alger Centre', wilaya_id: 16, wilaya_name: 'Alger', is_deliverable: 1, has_stop_desk: 1 }] });
    }
    return response({ has_more: false, data: [{ center_id: 163001, name: 'Centre Alger', address: 'Centre ville', commune_id: 1601, commune_name: 'Alger Centre', wilaya_id: 16, wilaya_name: 'Alger' }] });
  };

  const options = await getYalidineManualParcelOptions(baseUrl, credentials, fetchImpl);
  assert.deepEqual(urls.sort(), ['/v1/centers/', '/v1/communes/', '/v1/wilayas/']);
  assert.equal(options.wilayas[0].name, 'Alger');
  assert.equal(options.communes[0].wilaya_id, 16);
  assert.equal(options.centers[0].center_id, 163001);
});
