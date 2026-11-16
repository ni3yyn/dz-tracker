/**
 * Server-side Yalidine / Guepex booking, locations and fee quotation.
 * order_id is the merchant correlation key; tracking is carrier-generated.
 */
export interface YalidineApiCredentials { apiId: string; apiToken: string; }

export interface YalidineCreateParcelInput {
  orderId: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2?: string | null;
  address: string;
  fromWilayaName: string;
  toWilayaName: string;
  toCommuneName: string;
  productDescription: string;
  amountToCollect: number;
  declaredValue: number;
  insurance: boolean;
  length: number;
  width: number;
  height: number;
  weight: number;
  deliveryFeePayer: 'sender' | 'receiver';
  stopDesk: boolean;
  stopDeskId?: string | number | null;
  hasExchange: boolean;
  productToCollect?: string | null;
  openingDecision?: 'accept' | 'reject';
  economic?: boolean;
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
  stopdesk_id?: number;
  has_exchange: boolean;
  product_to_collect?: string;
  opening_decision?: 'accept' | 'reject';
  economic?: boolean;
}

export interface YalidineParcelMatch {
  order_id: string;
  tracking: string;
  label: string | null;
  import_id: number | null;
  last_status: string | null;
}

export interface YalidineManualParcelOptions {
  platform: 'guepex' | 'yalidine';
  wilayas: Array<{ id: number; name: string; is_deliverable: boolean }>;
  communes: Array<{ id: number; name: string; wilaya_id: number; wilaya_name: string; is_deliverable: boolean; has_stop_desk: boolean }>;
  centers: Array<{ center_id: number; name: string; address: string; commune_id: number; commune_name: string; wilaya_id: number; wilaya_name: string }>;
}

export interface YalidineFeeQuote {
  fromWilayaId: number;
  toWilayaId: number;
  fromWilayaName: string;
  toWilayaName: string;
  zone: number | null;
  returnFee: number;
  codPercentage: number;
  insurancePercentage: number;
  oversizeFee: number;
  communeId: number;
  communeName: string;
  expressHome: number | null;
  expressDesk: number | null;
  economicHome: number | null;
  economicDesk: number | null;
}

export interface YalidineFeeEstimateInput {
  stopDesk: boolean;
  economic: boolean;
  amountToCollect: number;
  declaredValue: number;
  insured: boolean;
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface YalidineFeeEstimate {
  baseDeliveryFee: number | null;
  billableWeight: number;
  overweightFee: number;
  codFee: number;
  insuranceFee: number;
  estimatedDeliveryTotal: number | null;
  returnFee: number;
}

export type YalidineApiFailureKind = 'rejected' | 'rate_limited' | 'uncertain' | 'unavailable' | 'ambiguous';

export class YalidineApiError extends Error {
  readonly kind: YalidineApiFailureKind;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  constructor(message: string, kind: YalidineApiFailureKind, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'YalidineApiError';
    this.kind = kind;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const ALLOWED_API_HOSTS = new Set(['api.guepex.app', 'api.yalidine.app']);
const MAX_AMOUNT = 150_000;

export function normalizeYalidineApiBaseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch {
    throw new YalidineApiError('إعداد عنوان Yalidine / Guepex API غير صالح.', 'rejected');
  }
  if (
    url.protocol !== 'https:' ||
    !ALLOWED_API_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port || url.username || url.password || url.search || url.hash ||
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
function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function responseRows(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.body)) return payload.body;
  if (Array.isArray(payload?.parcels)) return payload.parcels;
  throw new YalidineApiError('أعادت Guepex صيغة غير متوقعة لقائمة الطرود أو المواقع.', 'unavailable');
}
function apiMessage(payload: any): string {
  const direct = asText(payload?.message) || asText(payload?.error) || asText(payload?.detail);
  if (direct) return direct;
  const nested = asText(payload?.error?.message) || asText(payload?.errors?.message);
  if (nested) return nested;
  if (Array.isArray(payload?.errors)) {
    const entries = payload.errors.map((item: any) => asText(item?.message) || asText(item)).filter(Boolean);
    if (entries.length) return entries.join('، ');
  }
  return '';
}

const YALIDINE_REQUEST_INTERVAL_MS = 1_100;
const nextRequestAtByApiId = new Map<string, number>();

async function waitForApiRequestSlot(apiId: string): Promise<void> {
  const key = apiId.trim() || 'default';
  const now = Date.now();
  const scheduledAt = Math.max(now, nextRequestAtByApiId.get(key) || now);
  nextRequestAtByApiId.set(key, scheduledAt + YALIDINE_REQUEST_INTERVAL_MS);
  const waitMs = scheduledAt - now;
  if (waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}

function deferApiRequests(apiId: string, milliseconds: number): void {
  const key = apiId.trim() || 'default';
  const nextAllowed = Date.now() + Math.max(YALIDINE_REQUEST_INTERVAL_MS, milliseconds);
  nextRequestAtByApiId.set(key, Math.max(nextRequestAtByApiId.get(key) || 0, nextAllowed));
}

const MANUAL_OPTIONS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const manualParcelOptionsCache = new Map<string, {
  expiresAt: number;
  options: YalidineManualParcelOptions;
}>();
const manualParcelOptionsInFlight = new Map<string, Promise<YalidineManualParcelOptions>>();

async function requestJson(
  baseUrl: URL,
  credentials: YalidineApiCredentials,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<any> {
  if (fetchImpl === fetch) await waitForApiRequestSlot(credentials.apiId);

  let response: Response;
  try {
    const url = /^https:\/\//i.test(path) ? new URL(path) : endpoint(baseUrl, path);
    response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: init.signal ?? AbortSignal.timeout(20_000),
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
      timedOut
        ? 'انتهت مهلة الاتصال. نتيجة إنشاء الشحنة غير مؤكدة؛ تحقق من رقم الطلب قبل إعادة المحاولة.'
        : 'تعذر الاتصال بواجهة Yalidine / Guepex API.',
      init.method === 'POST' ? 'uncertain' : 'unavailable'
    );
  }

  let text = '';
  try { text = await response.text(); } catch {
    throw new YalidineApiError(
      'انقطع الاتصال أثناء قراءة رد الشركة. نتيجة الإنشاء غير مؤكدة؛ لا تعِد الإرسال قبل التحقق.',
      init.method === 'POST' ? 'uncertain' : 'unavailable',
      response.status
    );
  }
  let payload: any = null;
  if (text) {
    try { payload = JSON.parse(text); } catch {
      throw new YalidineApiError(
        'أعادت الشركة استجابة غير قابلة للقراءة.',
        init.method === 'POST' ? 'uncertain' : 'unavailable',
        response.status
      );
    }
  }
  if (!response.ok) {
    const message = apiMessage(payload);
    const retryHeader = Number(response.headers.get('retry-after'));
    const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0 ? Math.ceil(retryHeader) : undefined;
    if (response.status === 429) {
      const cooldownMs = retryAfter ? retryAfter * 1000 : 2_000;
      if (fetchImpl === fetch) deferApiRequests(credentials.apiId, cooldownMs);
      const retryMessage = retryAfter
        ? ` أعد المحاولة بعد ${retryAfter} ثانية.`
        : ' انتظر ثانيتين ثم أعد المحاولة.';
      throw new YalidineApiError(
        'بلغ حساب Guepex / Yalidine الحد المسموح من طلبات API خلال الثانية.' + retryMessage,
        'rate_limited',
        response.status,
        retryAfter
      );
    }
    const kind: YalidineApiFailureKind = response.status >= 500
      ? (init.method === 'POST' ? 'uncertain' : 'unavailable')
      : 'rejected';
    throw new YalidineApiError(message || 'رفضت الشركة الطلب (HTTP ' + response.status + ').', kind, response.status);
  }
  const secondQuotaHeader = response.headers.get('second-quota-left');
  const secondQuotaLeft = secondQuotaHeader === null ? null : Number(secondQuotaHeader);
  if (
    fetchImpl === fetch &&
    secondQuotaLeft !== null &&
    Number.isFinite(secondQuotaLeft) &&
    secondQuotaLeft <= 0
  ) {
    deferApiRequests(credentials.apiId, YALIDINE_REQUEST_INTERVAL_MS);
  }
  return payload;
}

function normalizePhone(value: string, label: string): string {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('213') ? '0' + digits.slice(3) : digits;
  if (!/^0(?:\d{8}|\d{9})$/.test(local)) {
    throw new YalidineApiError(label + ' غير صالح. استخدم رقماً جزائرياً يبدأ بـ 0.', 'rejected');
  }
  return local;
}
function integerInRange(value: unknown, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new YalidineApiError(label + ' يجب أن يكون عدداً صحيحاً بين ' + min + ' و' + max + '.', 'rejected');
  }
  return parsed;
}

export function buildYalidineCreateParcelData(input: YalidineCreateParcelInput): YalidineCreateParcelData {
  const orderId = input.orderId.trim();
  const firstName = input.firstName.trim();
  const familyName = input.lastName.trim();
  const address = input.address.trim();
  const fromWilayaName = input.fromWilayaName.trim();
  const toWilayaName = input.toWilayaName.trim();
  const toCommuneName = input.toCommuneName.trim();
  const productDescription = input.productDescription.trim();

  if (!orderId || orderId.length > 100) throw new YalidineApiError('مرجع الطلب الداخلي غير صالح.', 'rejected');
  if (!firstName || firstName.length > 80) throw new YalidineApiError('الاسم الشخصي للعميل مطلوب.', 'rejected');
  if (!familyName || familyName.length > 100) throw new YalidineApiError('لقب العميل مطلوب.', 'rejected');
  if (!address || address.length > 255) throw new YalidineApiError('عنوان العميل مطلوب ويجب ألا يتجاوز 255 حرفاً.', 'rejected');
  if (!fromWilayaName || !toWilayaName || !toCommuneName) {
    throw new YalidineApiError('اختر ولاية الانطلاق وولاية وبلدية المستلم من قوائم شركة التوصيل.', 'rejected');
  }
  if (!productDescription || productDescription.length > 255) {
    throw new YalidineApiError('وصف محتوى الشحنة مطلوب ويجب ألا يتجاوز 255 حرفاً.', 'rejected');
  }

  const amount = integerInRange(input.amountToCollect, 'مبلغ التحصيل', 0, MAX_AMOUNT);
  const declaredValue = integerInRange(input.declaredValue, 'القيمة المصرّح بها', 0, MAX_AMOUNT);
  const weight = integerInRange(input.weight, 'الوزن بالكيلوغرام', 0, 100);
  const length = integerInRange(input.length, 'الطول بالسنتيمتر', 0, 500);
  const width = integerInRange(input.width, 'العرض بالسنتيمتر', 0, 500);
  const height = integerInRange(input.height, 'الارتفاع بالسنتيمتر', 0, 500);
  const phone = normalizePhone(input.phone, 'رقم الهاتف');
  const phone2 = input.phone2?.trim() ? normalizePhone(input.phone2, 'رقم الهاتف الإضافي') : '';
  if (phone2 && phone2 === phone) throw new YalidineApiError('رقم الهاتف الإضافي يجب أن يختلف عن الرقم الأساسي.', 'rejected');

  let stopdeskId: number | undefined;
  if (input.stopDesk) {
    const raw = String(input.stopDeskId ?? '').trim();
    stopdeskId = /^\d+$/.test(raw) ? Number(raw) : undefined;
    if (!stopdeskId || !Number.isSafeInteger(stopdeskId)) {
      throw new YalidineApiError('اختر مكتب استلام صحيحاً قبل إنشاء الشحنة.', 'rejected');
    }
  }

  const hasExchange = Boolean(input.hasExchange);
  const productToCollect = String(input.productToCollect || '').trim();
  if (hasExchange && !productToCollect) {
    throw new YalidineApiError('اكتب اسم المنتج الذي سيستلمه مندوب التوصيل في عملية التبادل.', 'rejected');
  }
  if (productToCollect.length > 255) {
    throw new YalidineApiError('وصف المنتج المسترجع يجب ألا يتجاوز 255 حرفاً.', 'rejected');
  }
  if (input.openingDecision && !['accept', 'reject'].includes(input.openingDecision)) {
    throw new YalidineApiError('اختيار السماح بفتح الطرد غير صالح.', 'rejected');
  }

  const parcel: YalidineCreateParcelData = {
    order_id: orderId,
    from_wilaya_name: fromWilayaName,
    firstname: firstName,
    familyname: familyName,
    contact_phone: phone2 ? phone + ',' + phone2 : phone,
    address,
    to_commune_name: toCommuneName,
    to_wilaya_name: toWilayaName,
    product_list: productDescription,
    price: amount,
    do_insurance: Boolean(input.insurance),
    declared_value: declaredValue,
    length,
    width,
    height,
    weight,
    freeshipping: input.deliveryFeePayer === 'sender',
    is_stopdesk: Boolean(input.stopDesk),
    has_exchange: hasExchange,
  };
  if (stopdeskId) parcel.stopdesk_id = stopdeskId;
  if (hasExchange) parcel.product_to_collect = productToCollect;
  if (input.openingDecision) parcel.opening_decision = input.openingDecision;
  if (input.economic !== undefined) parcel.economic = Boolean(input.economic);
  return parcel;
}

export async function findYalidineParcelsByOrderId(
  baseUrlInput: string,
  credentials: YalidineApiCredentials,
  orderId: string,
  fetchImpl: typeof fetch = fetch
): Promise<YalidineParcelMatch[]> {
  if (!orderId.trim()) throw new YalidineApiError('مرجع الطلب الداخلي مطلوب للبحث عن الشحنة.', 'rejected');
  const baseUrl = normalizeYalidineApiBaseUrl(baseUrlInput);
  const url = endpoint(baseUrl, 'parcels/');
  url.searchParams.set('order_id', orderId);
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('fields', 'tracking,order_id,label,import_id,last_status');
  const payload = await requestJson(baseUrl, credentials, url.toString(), { method: 'GET' }, fetchImpl);
  const rows = responseRows(payload).filter((row) => asText(row?.order_id) === orderId);
  if (rows.some((row) => !asText(row?.tracking))) {
    throw new YalidineApiError('عثر Guepex على مرجع الطلب لكن لم يرجع رقم تتبع صالحاً. لن نعيد الإنشاء تلقائياً.', 'ambiguous');
  }
  return rows.map((row) => ({
    order_id: asText(row.order_id),
    tracking: asText(row.tracking),
    label: asText(row.label) || null,
    import_id: asNumber(row.import_id),
    last_status: asText(row.last_status) || null,
  })).filter((row) => Boolean(row.tracking));
}

export async function findYalidineParcelsByTracking(
  baseUrlInput: string,
  credentials: YalidineApiCredentials,
  tracking: string,
  fetchImpl: typeof fetch = fetch
): Promise<YalidineParcelMatch[]> {
  const normalizedTracking = tracking.trim();
  if (!/^yal-[A-Za-z0-9]+$/i.test(normalizedTracking)) {
    throw new YalidineApiError('رقم تتبع Yalidine / Guepex غير صالح للبحث.', 'rejected');
  }
  const baseUrl = normalizeYalidineApiBaseUrl(baseUrlInput);
  const url = endpoint(baseUrl, 'parcels/');
  url.searchParams.set('tracking', normalizedTracking);
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('fields', 'tracking,order_id,label,import_id,last_status');
  const payload = await requestJson(baseUrl, credentials, url.toString(), { method: 'GET' }, fetchImpl);
  const rows = responseRows(payload).filter((row) => asText(row?.tracking).toLowerCase() === normalizedTracking.toLowerCase());
  return rows.map((row) => ({
    order_id: asText(row.order_id),
    tracking: asText(row.tracking),
    label: asText(row.label) || null,
    import_id: asNumber(row.import_id),
    last_status: asText(row.last_status) || null,
  }));
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
  if (item?.success === false) throw new YalidineApiError(asText(item.message) || 'رفضت الشركة إنشاء الشحنة.', 'rejected');
  if (item?.success !== true || !asText(item.tracking)) {
    throw new YalidineApiError('لم تؤكد واجهة الشركة نتيجة إنشاء الشحنة. تحقق بالمرجع قبل أي محاولة أخرى.', 'uncertain');
  }
  return {
    order_id: parcel.order_id,
    tracking: asText(item.tracking),
    label: asText(item.label) || null,
    import_id: asNumber(item.import_id),
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
    const payload = await requestJson(baseUrl, credentials, url.toString(), { method: 'GET' }, fetchImpl);
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
  const cacheKey = `${baseUrl.origin}|${credentials.apiId}`;
  const canUseProcessCache = fetchImpl === fetch;

  if (canUseProcessCache) {
    const cached = manualParcelOptionsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.options;
    const inFlight = manualParcelOptionsInFlight.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const loadOptions = async (): Promise<YalidineManualParcelOptions> => {
    // requestJson reserves one API slot per credential, so these lookups cannot
    // burst three requests into Guepex's per-second quota.
    const wilayaRows = await fetchAll(baseUrl, credentials, 'wilayas', fetchImpl);
    const communeRows = await fetchAll(baseUrl, credentials, 'communes', fetchImpl);
    const centerRows = await fetchAll(baseUrl, credentials, 'centers', fetchImpl);
    return {
      platform: baseUrl.hostname === 'api.guepex.app' ? 'guepex' : 'yalidine',
      wilayas: wilayaRows.map((row) => ({
        id: Number(row.id), name: asText(row.name), is_deliverable: Number(row.is_deliverable) === 1,
      })).filter((row) => Number.isSafeInteger(row.id) && row.id > 0 && row.name),
      communes: communeRows.map((row) => ({
        id: Number(row.id), name: asText(row.name), wilaya_id: Number(row.wilaya_id),
        wilaya_name: asText(row.wilaya_name), is_deliverable: Number(row.is_deliverable) === 1,
        has_stop_desk: Number(row.has_stop_desk) === 1,
      })).filter((row) => Number.isSafeInteger(row.id) && Number.isSafeInteger(row.wilaya_id) && row.id > 0 && row.name && row.wilaya_name),
      centers: centerRows.map((row) => ({
        center_id: Number(row.center_id), name: asText(row.name), address: asText(row.address),
        commune_id: Number(row.commune_id), commune_name: asText(row.commune_name),
        wilaya_id: Number(row.wilaya_id), wilaya_name: asText(row.wilaya_name),
      })).filter((row) => Number.isSafeInteger(row.center_id) && row.center_id > 0 && row.name && Number.isSafeInteger(row.wilaya_id)),
    };
  };

  if (!canUseProcessCache) return loadOptions();

  const pending = loadOptions();
  manualParcelOptionsInFlight.set(cacheKey, pending);
  try {
    const options = await pending;
    manualParcelOptionsCache.set(cacheKey, {
      expiresAt: Date.now() + MANUAL_OPTIONS_CACHE_TTL_MS,
      options,
    });
    if (manualParcelOptionsCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of manualParcelOptionsCache) {
        if (value.expiresAt <= now || manualParcelOptionsCache.size > 100) {
          manualParcelOptionsCache.delete(key);
        }
        if (manualParcelOptionsCache.size <= 100) break;
      }
    }
    return options;
  } finally {
    manualParcelOptionsInFlight.delete(cacheKey);
  }
}

export async function getYalidineFeeQuote(
  baseUrlInput: string,
  credentials: YalidineApiCredentials,
  fromWilayaId: number,
  toWilayaId: number,
  communeId: number,
  fetchImpl: typeof fetch = fetch
): Promise<YalidineFeeQuote> {
  for (const [label, id] of [['ولاية الانطلاق', fromWilayaId], ['ولاية الوصول', toWilayaId], ['بلدية الوصول', communeId]] as const) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
      throw new YalidineApiError('معرّف ' + label + ' غير صالح عند طلب تسعيرة التوصيل.', 'rejected');
    }
  }
  const baseUrl = normalizeYalidineApiBaseUrl(baseUrlInput);
  const url = endpoint(baseUrl, 'fees/');
  url.searchParams.set('from_wilaya_id', String(fromWilayaId));
  url.searchParams.set('to_wilaya_id', String(toWilayaId));
  const payload = await requestJson(baseUrl, credentials, url.toString(), { method: 'GET' }, fetchImpl);
  const perCommune = payload?.per_commune || {};
  const commune = perCommune[String(communeId)] ||
    Object.values(perCommune).find((row: any) => Number(row?.commune_id) === Number(communeId));
  if (!commune) throw new YalidineApiError('لم ترجع Guepex تسعيرة لهذه البلدية من ولاية الانطلاق المحددة.', 'unavailable');
  return {
    fromWilayaId,
    toWilayaId,
    fromWilayaName: asText(payload?.from_wilaya_name),
    toWilayaName: asText(payload?.to_wilaya_name),
    zone: asNumber(payload?.zone),
    returnFee: asNumber(payload?.retour_fee) ?? 0,
    codPercentage: asNumber(payload?.cod_percentage) ?? 0,
    insurancePercentage: asNumber(payload?.insurance_percentage) ?? 0,
    oversizeFee: asNumber(payload?.oversize_fee) ?? 0,
    communeId,
    communeName: asText(commune?.commune_name),
    expressHome: asNumber(commune?.express_home),
    expressDesk: asNumber(commune?.express_desk),
    economicHome: asNumber(commune?.economic_home),
    economicDesk: asNumber(commune?.economic_desk),
  };
}

export function estimateYalidineFees(quote: YalidineFeeQuote, input: YalidineFeeEstimateInput): YalidineFeeEstimate {
  const billableWeight = Math.max(
    Number(input.weight) || 0,
    (Number(input.length) || 0) * (Number(input.width) || 0) * (Number(input.height) || 0) * 0.0002
  );
  const baseDeliveryFee = input.economic
    ? (input.stopDesk ? quote.economicDesk : quote.economicHome)
    : (input.stopDesk ? quote.expressDesk : quote.expressHome);
  const overweightFee = Math.ceil(Math.max(0, billableWeight - 5) * quote.oversizeFee);
  const chargedValue = Math.max(Number(input.amountToCollect) || 0, Number(input.declaredValue) || 0);
  const codFee = chargedValue * quote.codPercentage / 100;
  const insuranceFee = input.insured ? chargedValue * quote.insurancePercentage / 100 : 0;
  return {
    baseDeliveryFee,
    billableWeight: Number(billableWeight.toFixed(2)),
    overweightFee,
    codFee: Math.round(codFee),
    insuranceFee: Math.round(insuranceFee),
    estimatedDeliveryTotal: baseDeliveryFee === null
      ? null
      : Math.round(baseDeliveryFee + overweightFee + codFee + insuranceFee),
    returnFee: quote.returnFee,
  };
}
