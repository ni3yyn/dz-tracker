'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import { decryptEcomV2Credentials, encryptEcomV2Credentials } from '../../../lib/ecom-v2-credentials';

const API = 'https://ecom-dz.com/api_v2';
const TIMEOUT_MS = 15000;
type Row = Record<string, any>;

function rows(body: any): Row[] {
  if (Array.isArray(body)) return body.filter((x) => x && typeof x === 'object');
  if (Array.isArray(body?.items)) return body.items.filter((x: any) => x && typeof x === 'object');
  if (Array.isArray(body?.data)) return body.data.filter((x: any) => x && typeof x === 'object');
  return [];
}
function safeMessage(body: any): string {
  return String(body?.error?.message || body?.detail?.error?.message || body?.message || body?.erreur || '').trim();
}
async function merchantId(): Promise<string> {
  const auth = await createClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new Error('انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.');
  const db = getSupabaseAdminClient();
  const { data, error: lookupError } = await db.from('merchants').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (lookupError || !data) throw new Error('تعذر العثور على متجر مرتبط بحسابك.');
  return data.id;
}
async function loadIntegration(id: string) {
  const db = getSupabaseAdminClient();
  const { data, error } = await (db as any).from('merchant_carrier_integrations')
    .select('id,credentials_encrypted,connected_at,sync_enabled,last_sync_at,last_success_at,last_error')
    .eq('merchant_id', id).eq('provider', 'ecom_v2').maybeSingle();
  if (error) throw new Error('تعذر قراءة ربط E-com Delivery v2. تأكد من تطبيق تحديث قاعدة البيانات.');
  return data;
}
function credentials(id: string, encrypted: string) {
  const secret = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
  if (secret.length < 32) throw new Error('إعداد CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل على الخادم.');
  return decryptEcomV2Credentials(encrypted, id, secret);
}
async function request(path: string, auth: { apiKey: string; apiToken: string }, options: { method?: 'GET'|'POST'|'DELETE'; query?: Record<string,string>; body?: unknown } = {}) {
  const url = new URL(path.replace(/^\/+/, ''), API + '/');
  for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': auth.apiKey,
        'X-API-Token': auth.apiToken,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error: any) {
    const e: any = new Error(error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'انتهت مهلة الاتصال بـ E-com Delivery. تحقق من لوحة الشركة قبل إعادة أي محاولة إنشاء.'
      : 'تعذر الاتصال بخوادم E-com Delivery. تحقق من الاتصال قبل إعادة المحاولة.');
    e.providerRejected = false;
    throw e;
  }
  let body: any;
  try { body = await response.json(); }
  catch {
    const e: any = new Error('أعادت E-com Delivery استجابة غير مفهومة (HTTP ' + response.status + ').');
    e.providerRejected = false;
    throw e;
  }
  if (!response.ok) {
    const e: any = new Error(safeMessage(body) || 'فشل طلب E-com Delivery (HTTP ' + response.status + ').');
    e.statusCode = response.status;
    e.providerRejected = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    throw e;
  }
  return body;
}
async function verify(auth: { apiKey: string; apiToken: string }) {
  const body = await request('/wilayas', auth);
  if (!Array.isArray(body) || !body.some((x: any) => x && x.id != null && String(x.libelle || '').trim())) {
    throw new Error(safeMessage(body) || 'لم تُرجع E-com Delivery قائمة ولايات صالحة. لم يتم حفظ بيانات الربط.');
  }
}
export async function getEcomV2Status() {
  try {
    const id = await merchantId();
    const row = await loadIntegration(id);
    return { success: true, status: row ? { connected: Boolean(row.sync_enabled && row.credentials_encrypted), ...row } : { connected: false } };
  } catch (e: any) { return { success: false, error: e?.message || 'تعذر تحميل حالة الربط.' }; }
}
export async function saveEcomV2Integration(apiKeyInput: string, apiTokenInput: string) {
  try {
    const id = await merchantId();
    const apiKey = String(apiKeyInput || '').trim();
    const apiToken = String(apiTokenInput || '').trim();
    if (apiKey.length < 4 || apiToken.length < 4 || apiKey.length > 2048 || apiToken.length > 2048) {
      throw new Error('أدخل KEY وToken الصحيحين من صفحة التطوير في حساب E-com Delivery.');
    }
    if (!/^[\x21-\x7E]+$/.test(apiKey) || !/^[\x21-\x7E]+$/.test(apiToken)) throw new Error('تحقق من نسخ KEY وToken دون مسافات أو أسطر إضافية.');
    const secret = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (secret.length < 32) throw new Error('إعداد CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل في Vercel.');
    const auth = { apiKey, apiToken };
    await verify(auth);
    const existing = await loadIntegration(id);
    const db = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await (db as any).from('merchant_carrier_integrations').upsert({
      merchant_id: id, provider: 'ecom_v2', base_url: API,
      credentials_encrypted: encryptEcomV2Credentials(apiKey, apiToken, id, secret),
      sync_enabled: true, connected_at: existing?.connected_at || now,
      last_error: null, last_error_at: null, updated_at: now,
    }, { onConflict: 'merchant_id,provider' })
      .select('connected_at,last_sync_at,last_success_at,last_error,sync_enabled').single();
    if (error || !data) throw new Error('تم التحقق من بيانات الحساب، لكن تعذر حفظها. تأكد من تطبيق تحديث قاعدة البيانات.');
    revalidatePath('/merchant');
    return { success: true, status: { connected: true, ...data } };
  } catch (e: any) { return { success: false, error: e?.message || 'تعذر ربط الحساب.' }; }
}
export async function testEcomV2Connection() {
  try {
    const id = await merchantId();
    const row = await loadIntegration(id);
    if (!row?.sync_enabled || !row.credentials_encrypted) throw new Error('اربط حساب E-com Delivery أولاً.');
    await verify(credentials(id, String(row.credentials_encrypted)));
    return { success: true, checkedAt: new Date().toISOString() };
  } catch (e: any) { return { success: false, error: e?.message || 'فشل اختبار الاتصال.' }; }
}
export async function disconnectEcomV2Integration() {
  try {
    const id = await merchantId();
    const db = getSupabaseAdminClient();
    const { error } = await (db as any).from('merchant_carrier_integrations').delete().eq('merchant_id', id).eq('provider', 'ecom_v2');
    if (error) throw new Error('تعذر فصل الحساب.');
    revalidatePath('/merchant');
    return { success: true };
  } catch (e: any) { return { success: false, error: e?.message || 'تعذر فصل الحساب.' }; }
}
export async function getEcomV2DispatchOptions(wilayaId?: string) {
  try {
    const id = await merchantId();
    const row = await loadIntegration(id);
    if (!row?.sync_enabled || !row.credentials_encrypted) throw new Error('اربط حساب E-com Delivery v2 أولاً من قسم التكاملات.');
    const auth = credentials(id, String(row.credentials_encrypted));
    const tasks: Promise<any>[] = [request('/wilayas', auth)];
    if (wilayaId) {
      tasks.push(request('/communes', auth, { query: { id_wilaya: wilayaId } }));
      tasks.push(request('/stopdesks', auth, { query: { id_wilaya: wilayaId } }));
      tasks.push(request('/tarifs', auth));
    }
    const result = await Promise.all(tasks);
    const wilayas = rows(result[0]).map((x) => ({ id: String(x.id ?? ''), name: String(x.libelle ?? '').trim(), home: x.domicile !== false, stopdesk: x.stopdesk !== false }))
      .filter((x) => x.id && x.name && (x.home || x.stopdesk));
    const communes = wilayaId ? rows(result[1]).map((x) => ({ id: String(x.id ?? ''), name: String(x.commune ?? '').trim(), deliverable: x.livrable !== false }))
      .filter((x) => x.id && x.name && x.deliverable) : [];
    const desks = wilayaId ? rows(result[2]).map((x) => ({ id: String(x.code_stopdesk ?? '').trim(), name: String(x.nom_bureau ?? x.code_stopdesk ?? '').trim(), commune: String(x.commune ?? '').trim(), address: String(x.adresse ?? '').trim() }))
      .filter((x) => x.id && x.name) : [];
    const feeRows = wilayaId && Array.isArray(result[3]?.wilayas) ? result[3].wilayas : [];
    const feeRow = feeRows.find((x: any) => Number(x.wilaya) === Number(wilayaId));
    const home = feeRow?.domicile == null ? null : Number(feeRow.domicile);
    const stopDesk = feeRow?.stopdesk == null ? null : Number(feeRow.stopdesk);
    const rates = home !== null && Number.isFinite(home) && stopDesk !== null && Number.isFinite(stopDesk) ? { home, stopDesk } : null;
    return { success: true, wilayas, communes, desks, rates };
  } catch (e: any) { return { success: false, error: e?.message || 'تعذر تحميل بيانات E-com Delivery.' }; }
}
export async function getEcomV2DispatchStatus(orderId: string) {
  try {
    const id = await merchantId();
    const db = getSupabaseAdminClient();
    const { data: order, error: orderError } = await (db as any).from('orders').select('id,carrier_tracking_number,carrier_metadata')
      .eq('id', orderId).eq('merchant_id', id).maybeSingle();
    if (orderError || !order) throw new Error('لم نعثر على الطلب داخل متجرك.');
    const { data, error } = await (db as any).from('merchant_carrier_dispatch_attempts')
      .select('attempt_state,tracking_number,error_message').eq('merchant_id', id).eq('order_id', orderId).eq('provider', 'ecom_v2').maybeSingle();
    if (error) throw new Error('تعذر قراءة حالة محاولة الشحن.');
    const meta = order.carrier_metadata?.ecomV2 || {};
    const tracking = data?.tracking_number || meta.trackingNumber || '';
    const state = data?.attempt_state || meta.creationStatus || null;
    return { success: true, attempt: data || state || tracking ? {
      ...(data || {}), attempt_state: state, tracking_number: tracking || null,
      linked: Boolean(tracking && order.carrier_tracking_number === tracking),
      error_message: data?.error_message || meta.creationError || null,
    } : null };
  } catch (e: any) { return { success: false, error: e?.message || 'تعذر قراءة حالة محاولة الشحن.' }; }
}
export async function createEcomV2Shipment(orderId: string, input: {
  recipientName: string; phone: string; address: string; wilayaId: string; commune: string;
  product: string; quantity?: number; codAmount: number; deliveryType: 'home'|'stopdesk';
  stopDeskId?: string; note?: string;
}) {
  let attemptId = '';
  let createdTracking = '';
  try {
    const id = await merchantId();
    const db = getSupabaseAdminClient();
    const { data: order, error: orderError } = await (db as any).from('orders')
      .select('id,merchant_id,external_order_id,carrier_tracking_number,carrier_metadata')
      .eq('id', orderId).eq('merchant_id', id).maybeSingle();
    if (orderError || !order) throw new Error('لم نعثر على الطلب داخل متجرك.');
    const reference = String(order.external_order_id || '').trim();
    if (!reference) throw new Error('الطلب لا يحتوي على مرجع خارجي صالح لإرساله إلى E-com Delivery.');
    if (order.carrier_tracking_number) throw new Error('هذا الطلب مرتبط بالفعل برقم تتبع. لن ننشئ شحنة ثانية.');
    const { data: previous, error: previousError } = await (db as any).from('merchant_carrier_dispatch_attempts')
      .select('id,attempt_state,tracking_number').eq('merchant_id', id).eq('order_id', orderId).eq('provider', 'ecom_v2').maybeSingle();
    if (previousError) throw new Error('تعذر التحقق من محاولات الشحن السابقة.');
    if (previous && previous.attempt_state !== 'failed') {
      throw new Error(previous.tracking_number
        ? 'توجد شحنة E-com Delivery سابقة برقم ' + previous.tracking_number + '. لا تعاود الإنشاء.'
        : 'نتيجة محاولة سابقة غير محسومة. افحص لوحة E-com Delivery بالمرجع ' + reference + ' قبل إعادة المحاولة.');
    }
    const authRow = await loadIntegration(id);
    if (!authRow?.sync_enabled || !authRow.credentials_encrypted) throw new Error('اربط حساب E-com Delivery أولاً.');
    const auth = credentials(id, String(authRow.credentials_encrypted));
    const recipientName = String(input?.recipientName || '').trim();
    const phone = String(input?.phone || '').trim();
    const address = String(input?.address || '').trim();
    const wilayaId = String(input?.wilayaId || '').trim();
    const commune = String(input?.commune || '').trim();
    const product = String(input?.product || '').trim();
    const note = String(input?.note || '').trim().slice(0, 500);
    const amount = Number(input?.codAmount);
    const quantity = input?.quantity == null ? 1 : Number(input.quantity);
    if (!recipientName || recipientName.length > 60) throw new Error('اسم المستلم مطلوب ولا يتجاوز 60 حرفاً حسب قيود E-com Delivery.');
    if (!phone || !/^[+0-9][0-9\s()-]{7,19}$/.test(phone)) throw new Error('أدخل رقم هاتف صحيحاً للعميل.');
    if (!address || address.length > 100) throw new Error('عنوان التوصيل مطلوب ولا يتجاوز 100 حرف حسب قيود E-com Delivery.');
    if (!product || product.length > 200) throw new Error('أدخل اسم المنتج بشكل صحيح.');
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new Error('مبلغ التحصيل غير صالح.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('كمية المنتج غير صالحة.');
    if (!/^\d{1,2}$/.test(wilayaId) || Number(wilayaId) < 1 || Number(wilayaId) > 58) throw new Error('رمز الولاية غير صالح.');
    if (input.deliveryType === 'home' && !commune) throw new Error('اختر البلدية للتوصيل إلى المنزل.');
    if (input.deliveryType === 'stopdesk' && !String(input.stopDeskId || '').trim()) throw new Error('اختر مكتب E-com للاستلام.');
    if (input.deliveryType !== 'home' && input.deliveryType !== 'stopdesk') throw new Error('نوع التوصيل غير صالح.');
    const options = await getEcomV2DispatchOptions(wilayaId);
    if (!options.success) throw new Error(options.error || 'تعذر التحقق من الوجهة.');
    if (!options.wilayas.some((x: any) => x.id === wilayaId)) throw new Error('الولاية غير موجودة ضمن ولايات E-com Delivery.');
    if (input.deliveryType === 'home' && !options.communes.some((x: any) => x.name === commune)) throw new Error('البلدية غير متاحة للتوصيل لدى E-com Delivery.');
    if (input.deliveryType === 'stopdesk' && !options.desks.some((x: any) => x.id === input.stopDeskId)) throw new Error('مكتب الاستلام غير موجود في قائمة E-com لهذه الولاية.');
    const payload: Record<string, unknown> = {
      nom_complet: recipientName, mobile_1: phone, id_wilaya: Number(wilayaId),
      total: Math.round(amount), stopdesk: input.deliveryType === 'stopdesk' ? 1 : 0,
      article: product, quantite: quantity, id_externe: reference,
    };
    if (input.deliveryType === 'home') payload.commune = commune;
    else payload.code_stopdesk = input.stopDeskId;
    if (address) payload.adresse = address;
    if (note) payload.note_fournisseur = note;
    const { data: attempt, error: insertError } = await (db as any).from('merchant_carrier_dispatch_attempts')
      .insert({ merchant_id: id, order_id: orderId, provider: 'ecom_v2', attempt_state: 'pending', request_reference: reference })
      .select('id').single();
    if (previous) {
      const { data: retry, error } = await (db as any).from('merchant_carrier_dispatch_attempts')
        .update({ attempt_state: 'pending', tracking_number: null, error_message: null, updated_at: new Date().toISOString() })
        .eq('id', previous.id).eq('attempt_state', 'failed').select('id').maybeSingle();
      if (error || !retry) throw new Error('تغيرت حالة محاولة الشحن. حدّث الصفحة قبل المتابعة.');
      attemptId = retry.id;
    } else {
      if (insertError || !attempt) {
        if (insertError?.code === '23505') throw new Error('بدأت محاولة شحن أخرى لهذا الطلب. حدّث الصفحة وتحقق من الحالة.');
        throw new Error('تعذر حجز محاولة شحن آمنة.');
      }
      attemptId = attempt.id;
    }
    const metadata = order.carrier_metadata && typeof order.carrier_metadata === 'object' ? order.carrier_metadata : {};
    const { error: markError } = await (db as any).from('orders').update({
      carrier_metadata: { ...metadata, ecomV2: { creationStatus: 'pending', requestReference: reference, attemptStartedAt: new Date().toISOString() } },
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('merchant_id', id);
    if (markError) {
      await (db as any).from('merchant_carrier_dispatch_attempts').update({ attempt_state: 'failed', error_message: 'Could not mark order before dispatch.' }).eq('id', attemptId).eq('attempt_state', 'pending');
      attemptId = '';
      throw new Error('تعذر حفظ علامة الأمان. لم نرسل الشحنة إلى E-com Delivery.');
    }
    const body = await request('/colis', auth, { method: 'POST', body: [payload] });
    const line = Array.isArray(body?.resultats) ? body.resultats.find((x: any) => x && typeof x === 'object') : null;
    if (!line) {
      const e: any = new Error('استجابة إنشاء الشحنة لا تحتوي على نتيجة واضحة. افحص لوحة E-com Delivery بالمرجع قبل إعادة المحاولة.');
      e.providerRejected = false;
      throw e;
    }
    if (line.ok !== true) {
      const e: any = new Error(String(line.erreur || safeMessage(body) || 'رفضت E-com Delivery إنشاء الشحنة.'));
      e.providerRejected = true;
      throw e;
    }
    createdTracking = String(line.tracking || '').trim();
    if (!createdTracking) {
      const e: any = new Error('قبلت E-com Delivery الطلب لكنها لم تُرجع رقم تتبع. افحص لوحة الشركة قبل إعادة المحاولة.');
      e.providerRejected = false;
      throw e;
    }
    const { error: ledgerError } = await (db as any).from('merchant_carrier_dispatch_attempts')
      .update({ attempt_state: 'created', tracking_number: createdTracking, error_message: null, updated_at: new Date().toISOString() })
      .eq('id', attemptId);
    if (ledgerError) {
      await (db as any).from('orders').update({ carrier_metadata: { ...metadata, ecomV2: { trackingNumber: createdTracking, creationStatus: 'uncertain', creationError: 'Parcel created; local ledger update failed.' } } }).eq('id', orderId).eq('merchant_id', id);
      return { success: false, trackingNumber: createdTracking, error: 'أنشأت E-com Delivery الشحنة برقم ' + createdTracking + ' لكن تعذر حفظ التأكيد محلياً. لا تنشئ شحنة أخرى.' };
    }
    const { error: linkError } = await (db as any).from('orders').update({
      carrier_name: 'E-com Delivery v2', carrier_tracking_number: createdTracking,
      carrier_metadata: { ...metadata, ecomV2: { trackingNumber: createdTracking, requestReference: reference, wilayaId, commune: commune || null, stopDeskId: input.stopDeskId || null, address, codAmount: Math.round(amount), deliveryType: input.deliveryType, product, quantity, shippingFee: options.rates ? (input.deliveryType === 'stopdesk' ? options.rates.stopDesk : options.rates.home) : null, creationStatus: 'created', createdAt: new Date().toISOString() } },
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('merchant_id', id);
    if (linkError) return { success: false, trackingNumber: createdTracking, error: 'تم إنشاء الشحنة برقم ' + createdTracking + ' لكن تعذر ربطها محلياً. لا تعاود الإنشاء.' };
    revalidatePath('/merchant');
    return { success: true, trackingNumber: createdTracking };
  } catch (e: any) {
    if (attemptId && !createdTracking) {
      const state = e?.providerRejected ? 'failed' : 'uncertain';
      const message = String(e?.message || 'تعذر تحديد نتيجة إنشاء الشحنة.').slice(0, 500);
      await (getSupabaseAdminClient() as any).from('merchant_carrier_dispatch_attempts')
        .update({ attempt_state: state, error_message: message, updated_at: new Date().toISOString() })
        .eq('id', attemptId).eq('attempt_state', 'pending');
      const { data: current } = await (getSupabaseAdminClient() as any).from('orders').select('carrier_metadata').eq('id', orderId).maybeSingle();
      const meta = current?.carrier_metadata && typeof current.carrier_metadata === 'object' ? current.carrier_metadata : {};
      await (getSupabaseAdminClient() as any).from('orders').update({ carrier_metadata: { ...meta, ecomV2: { ...(meta.ecomV2 || {}), creationStatus: state, creationError: message, lastAttemptAt: new Date().toISOString() } } }).eq('id', orderId).eq('merchant_id', await merchantId());
    }
    return { success: false, trackingNumber: createdTracking || undefined, error: e?.message || 'تعذر إنشاء شحنة E-com Delivery.' };
  }
}
