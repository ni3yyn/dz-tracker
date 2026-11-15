/**
 * Server-side Yalidine / Guepex parcel creation and location lookups.
 *
 * The API contract follows CodFlow's Yalidine carrier adapter and Guepex API
 * documentation: POST /v1/parcels/ with an array, authenticated by X-API-ID
 * and X-API-TOKEN. GET/PATCH responses mask customer PII, so only the tracking
 * reference, label and operational fields are read back here.
 */

export interface YalidineApiCredentials {
  apiId: string;
  apiToken: string;
}

export interface YalidineCreateParcelInput {
  orderId: string;
  customerName: string;
  phone: string;
  address: string;
  fromWilayaName: string;
  toWilayaName: string;
  toCommuneName: string;
  productDescription: string;
  amountToCollect: number;
  weight: number;
  deliveryFeePayer: 'sender' | 'receiver';
  stopDesk: boolean;
  stopDeskId?: string | number | null;
}

export interface YalidineCreateParcelData {
  order_id: string;
  from_wilaya_name: string;
  firstname: string;
  familyname: string;
  contact_phone: string;
  address: string;
  to_commune_name: string;
  to_wilaya_name: string;
  product_list: string;
  price: number;
  do_insurance: boolean;
  declared_value: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  freeshipping: boolean;
  is_stopdesk: boolean;
  stopdesk_id: number | null;
  has_exchange: boolean;
}

export interface YalidineParcelMatch {
  order_id: string;
  tracking: string;
  label: string | null;
  import_id: number | null;
  last_status: string | null;
}

export interface YalidineManualParcelOptions {
  wilayas: Array<{ id: number; name: string; is_deliverable: boolean }>;
  communes: Array<{ id: number; name: string; wilaya_id: number; wilaya_name: string; is_deliverable: boolean; has_stop_desk: boolean }>;
  centers: Array<{ center_id: number; name: string; address: string; commune_id: number; commune_name: string; wilaya_id: number; wilaya_name: string }>;
}

export type YalidineApiFailureKind = 'rejected' | 'uncertain' | 'unavailable' | 'ambiguous';

export class YalidineApiError extends Error {
  readonly kind: YalidineApiFailureKind;
  readonly status?: number;

  constructor(message: string, kind: YalidineApiFailureKind, status?: number) {
    super(message);
    this.name = 'YalidineApiError';
    this.kind = kind;
    this.status = status;
  }
}

const ALLOWED_API_HOSTS = new Set(['api.guepex.app', 'api.yalidine.app']);
const MAX_AMOUNT = 150_000;

export function normalizeYalidineApiBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new YalidineApiError('إعداد عنوان Guepex API غير صالح.', 'rejected');
  }

  if (
    url.protocol !== 'https:' ||
    !ALLOWED_API_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/v1\/?$/.test(url.pathname)
  ) {
    throw new YalidineApiError('عنوان API غير مسموح. استخدم واجهة Yalidine / Guepex الرسمية فقط.', 'rejected');
  }

  return new URL('https://' + url.host + '/v1/');
}

function endpoint(baseUrl: URL, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), baseUrl);
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function responseRows(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.body)) return payload.body;
  if (Array.isArray(payload?.parcels)) return payload.parcels;
  throw new YalidineApiError('أعادت Guepex صيغة غير متوقعة لقائمة الطرود أو المواقع.', 'unavailable');
}

async function requestJson(
  baseUrl: URL,
  credentials: YalidineApiCredentials,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<any> {
  let response: Response;
  try {
    const requestUrl = /^https:\/\//i.test(path) ? new URL(path) : endpoint(baseUrl, path);
    response = await fetchImpl(requestUrl, {
      ...init,
      redirect: 'error',
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        'X-API-ID': credentials.apiId,
        'X-API-TOKEN': credentials.apiToken,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (error: any) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new YalidineApiError(
      timedOut ? 'انتهت مهلة الاتصال بـ Yalidine / Guepex.' : 'تعذر الاتصال بواجهة Yalidine / Guepex API.',
      init.method === 'POST' ? 'uncertain' : 'unavailable'
    );
  }

  const responseText = await response.text();
  let payload: any = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new YalidineApiError(
        'أعادت Yalidine / Guepex استجابة غير قابلة للقراءة.',
        init.method === 'POST' ? 'uncertain' : 'unavailable',
        response.status
      );
    }
  }

  if (!response.ok) {
    const message = asText(payload?.message) || asText(payload?.error);
    const kind: YalidineApiFailureKind = response.status >= 500
      ? (init.method === 'POST' ? 'uncertain' : 'unavailable')
      : 'rejected';
    throw new YalidineApiError(
      message || 'رفضت Yalidine / Guepex الطلب (HTTP ' + response.status + ').',
      kind,
      response.status
    );
  }

  return payload;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('213') ? '0' + digits.slice(3) : digits;
  if (!/^0(?:\d{8}|\d{9})$/.test(local)) {
    throw new YalidineApiError('رقم الهاتف غير صالح. أدخل رقماً جزائرياً يبدأ بـ 0.', 'rejected');
  }
  return local;
}

function splitCustomerName(value: string): { firstname: string; familyname: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw new YalidineApiError('اسم العميل مطلوب لإنشاء شحنة Yalidine / Guepex.', 'rejected');
  return {
    firstname: parts[0],
    familyname: parts.length > 1 ? parts.slice(1).join(' ') : parts[0],
  };
}

export function buildYalidineCreateParcelData(input: YalidineCreateParcelInput): YalidineCreateParcelData {
  const orderId = input.orderId.trim();
  const customerName = input.customerName.trim();
  const address = input.address.trim();
  const fromWilayaName = input.fromWilayaName.trim();
  const toWilayaName = input.toWilayaName.trim();
  const toCommuneName = input.toCommuneName.trim();
  const productDescription = input.productDescription.trim();

  if (!orderId || orderId.length > 100) throw new YalidineApiError('رقم الطلب مطلوب ويجب ألا يتجاوز 100 حرف.', 'rejected');
  if (!customerName || customerName.length > 120) throw new YalidineApiError('اسم العميل مطلوب ويجب ألا يتجاوز 120 حرفاً.', 'rejected');
  if (!address || address.length > 255) throw new YalidineApiError('عنوان العميل مطلوب ويجب ألا يتجاوز 255 حرفاً.', 'rejected');
  if (!fromWilayaName || !toWilayaName || !toCommuneName) throw new YalidineApiError('اختر ولاية الانطلاق وولاية وبلدية المستلم من قوائم Yalidine / Guepex.', 'rejected');
  if (!productDescription || productDescription.length > 255) throw new YalidineApiError('وصف محتوى الشحنة مطلوب ويجب ألا يتجاوز 255 حرفاً.', 'rejected');

  const amount = Number(input.amountToCollect);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
    throw new YalidineApiError('مبلغ التحصيل يجب أن يكون عدداً صحيحاً بين 0 و150000 دج.', 'rejected');
  }
  const weight = Number(input.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
    throw new YalidineApiError('الوزن يجب أن يكون عدداً صحيحاً بين 1 و100 كغ.', 'rejected');
  }

  let stopdeskId: number | null = null;
  if (input.stopDesk) {
    const rawId = String(input.stopDeskId ?? '').trim();
    stopdeskId = /^\d+$/.test(rawId) ? Number(rawId) : null;
    if (!stopdeskId || !Number.isSafeInteger(stopdeskId)) {
      throw new YalidineApiError('اختر مكتب الاستلام (Stop Desk) قبل إنشاء الشحنة.', 'rejected');
    }
  }

  const name = splitCustomerName(customerName);
  return {
    order_id: orderId,
    from_wilaya_name: fromWilayaName,
    ...name,
    contact_phone: normalizePhone(input.phone),
    address,
    to_commune_name: toCommuneName,
    to_wilaya_name: toWilayaName,
    product_list: productDescription,
    price: amount,
    do_insurance: false,
    declared_value: amount,
    length: 1,
    width: 1,
    height: 1,
    weight,
    freeshipping: input.deliveryFeePayer === 'sender',
    is_stopdesk: Boolean(input.stopDesk),
    stopdesk_id: stopdeskId,
    has_exchange: false,
  };
}

export async function findYalidineParcelsByOrderId(
  baseUrlInput: string,
  credentials: YalidineApiCredentials,
  orderId: string,
  fetchImpl: typeof fetch = fetch
): Promise<YalidineParcelMatch[]> {
  const baseUrl = normalizeYalidineApiBaseUrl(baseUrlInput);
  const url = endpoint(baseUrl, 'parcels/');
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('fields', 'tracking,order_id,label,import_id,last_status');

  const payload = await requestJson(baseUrl, credentials, url.toString(), {
    method: 'GET',
  }, fetchImpl);

  const matchingRows = responseRows(payload).filter((row) => asText(row?.order_id) === orderId);
  if (matchingRows.some((row) => !asText(row?.tracking))) {
    throw new YalidineApiError(
      'عثر Guepex على مرجع الطلب لكن لم يرجع رقم تتبع صالحاً. لن نعيد إنشاء الشحنة تلقائياً.',
      'ambiguous'
    );
  }

  return matchingRows
    .map((row) => ({
      order_id: asText(row.order_id),
      tracking: asText(row.tracking),
      label: asText(row.label) || null,
      import_id: Number.isInteger(Number(row.import_id)) ? Number(row.import_id) : null,
      last_status: asText(row.last_status) || null,
    }))
    .filter((row) => Boolean(row.tracking));
}

export async function createYalidineParcel(
  baseUrlInput: string,
  credentials: YalidineApiCredentials,
  parcel: YalidineCreateParcelData,
  fetchImpl: typeof fetch = fetch
): Promise<YalidineParcelMatch> {
  const baseUrl = normalizeYalidineApiBaseUrl(baseUrlInput);
  const payload = await requestJson(baseUrl, credentials, 'parcels/', {
    method: 'POST',
    body: JSON.stringify([parcel]),
  }, fetchImpl);

  const item = payload?.[parcel.order_id];
  if (item?.success === false) {
    const message = asText(item.message) || 'رفضت Yalidine / Guepex إنشاء الشحنة.';
    throw new YalidineApiError(message, 'rejected');
  }
  if (item?.success !== true || !asText(item.tracking)) {
    throw new YalidineApiError(
      'لم تؤكد واجهة Yalidine / Guepex نتيجة إنشاء الشحنة. يجب التحقق برقم الطلب قبل أي محاولة أخرى.',
      'uncertain'
    );
  }

  return {
    order_id: parcel.order_id,
    tracking: asText(item.tracking),
    label: asText(item.label) || null,
    import_id: Number.isInteger(Number(item.import_id)) ? Number(item.import_id) : null,
    last_status: 'En préparation',
  };
}

async function fetchAll(
  baseUrl: URL,
  credentials: YalidineApiCredentials,
  resource: string,
  fetchImpl: typeof fetch
): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = endpoint(baseUrl, resource + '/');
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', '1000');
    const payload = await requestJson(baseUrl, credentials, url.toString(), {
      method: 'GET',
    }, fetchImpl);
    const rows = responseRows(payload);
    all.push(...rows);
    if (!payload?.has_more || rows.length === 0) return all;
  }
  throw new YalidineApiError('تجاوزت قائمة مواقع Yalidine / Guepex الحد المتوقع للصفحات.', 'unavailable');
}

export async function getYalidineManualParcelOptions(
  baseUrlInput: string,
  credentials: YalidineApiCredentials,
  fetchImpl: typeof fetch = fetch
): Promise<YalidineManualParcelOptions> {
  const baseUrl = normalizeYalidineApiBaseUrl(baseUrlInput);
  const [wilayaRows, communeRows, centerRows] = await Promise.all([
    fetchAll(baseUrl, credentials, 'wilayas', fetchImpl),
    fetchAll(baseUrl, credentials, 'communes', fetchImpl),
    fetchAll(baseUrl, credentials, 'centers', fetchImpl),
  ]);

  return {
    wilayas: wilayaRows
      .map((row) => ({
        id: Number(row.id),
        name: asText(row.name),
        is_deliverable: Number(row.is_deliverable) === 1,
      }))
      .filter((row) => Number.isSafeInteger(row.id) && row.id > 0 && row.name),
    communes: communeRows
      .map((row) => ({
        id: Number(row.id),
        name: asText(row.name),
        wilaya_id: Number(row.wilaya_id),
        wilaya_name: asText(row.wilaya_name),
        is_deliverable: Number(row.is_deliverable) === 1,
        has_stop_desk: Number(row.has_stop_desk) === 1,
      }))
      .filter((row) => Number.isSafeInteger(row.id) && Number.isSafeInteger(row.wilaya_id) && row.id > 0 && row.name && row.wilaya_name),
    centers: centerRows
      .map((row) => ({
        center_id: Number(row.center_id),
        name: asText(row.name),
        address: asText(row.address),
        commune_id: Number(row.commune_id),
        commune_name: asText(row.commune_name),
        wilaya_id: Number(row.wilaya_id),
        wilaya_name: asText(row.wilaya_name),
      }))
      .filter((row) => Number.isSafeInteger(row.center_id) && row.center_id > 0 && row.name && Number.isSafeInteger(row.wilaya_id)),
  };
}
