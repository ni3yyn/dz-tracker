'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import { decryptElogistiaApiKey, encryptElogistiaApiKey } from '../../../lib/elogistia-credentials';

const API = 'https://api.elogistia.com';
const REQUEST_TIMEOUT_MS = 15000;

type ElogistiaRow = Record<string, any>;

function rowsFrom(body: any): ElogistiaRow[] {
  let value = body?.body ?? body?.data ?? body;
  if (value && !Array.isArray(value) && Array.isArray(value.data)) value = value.data;
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === 'object');
  return value && typeof value === 'object' ? [value] : [];
}

function providerError(body: any): string {
  const value = body?.body ?? body?.data ?? body;
  const message = value?.Message ?? value?.message ?? value?.error ?? body?.Message ?? body?.message ?? body?.error;
  return typeof message === 'string' && message.trim() ? message.trim() : '';
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
  const { data, error } = await (db as any)
    .from('merchant_carrier_integrations')
    .select('id,credentials_encrypted,connected_at,sync_enabled,last_sync_at,last_success_at,last_error')
    .eq('merchant_id', id).eq('provider', 'elogistia').maybeSingle();
  if (error) throw new Error('تعذر قراءة بيانات ربط Elogistia. تأكد من تطبيق تحديث قاعدة البيانات.');
  return data;
}

function tokenFor(id: string, encrypted: string): string {
  const secret = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
  if (secret.length < 32) throw new Error('إعداد التشفير CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل على الخادم.');
  return decryptElogistiaApiKey(encrypted, id, secret);
}

async function apiRequest(path: string, authName: 'key' | 'apiKey', apiKey: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET'): Promise<any> {
  const url = new URL(path.replace(/^\/+/, ''), API + '/');
  url.searchParams.set(authName, apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بـ Elogistia. أعد المحاولة بعد قليل.');
    throw new Error('تعذر الاتصال بخوادم Elogistia. تحقق من الاتصال ثم أعد المحاولة.');
  }
  let body: any;
  try { body = await response.json(); }
  catch { throw new Error('أعادت Elogistia استجابة غير مفهومة (HTTP ' + response.status + ').'); }
  if (response.status === 401 || response.status === 403) throw new Error('رفضت Elogistia API Key. تحقق من المفتاح وصلاحيات الحساب.');
  if (response.status === 429) throw new Error('وصل حساب Elogistia إلى حد الطلبات. انتظر قليلاً ثم أعد المحاولة.');
  if (!response.ok || body?.success === false || body?.error) {
    const message = providerError(body);
    throw new Error(message || 'فشل طلب Elogistia (HTTP ' + response.status + ').');
  }
  return body;
}

async function verifyApiKey(apiKey: string): Promise<void> {
  const body = await apiRequest('getWilayas/', 'key', apiKey);
  const rows = rowsFrom(body);
  if (!rows.length || !rows.some((row) => (row.id ?? row.code) != null && String(row.name ?? row.nom ?? row.wilaya ?? '').trim())) {
    const message = providerError(body);
    throw new Error(message || 'لم تُرجع Elogistia قائمة ولايات صالحة. لم يتم حفظ الربط.');
  }
}

export async function getElogistiaIntegrationStatus() {
  try {
    const id = await merchantId();
    const row = await loadIntegration(id);
    const connected = Boolean(row?.sync_enabled && row?.credentials_encrypted);
    return { success: true, status: row ? { connected, ...row } : { connected: false } };
  } catch (error: any) {
    return { success: false, status: { connected: false }, error: error?.message || 'تعذر تحميل حالة الربط.' };
  }
}

export async function saveElogistiaIntegration(apiKeyInput: string) {
  try {
    const id = await merchantId();
    const apiKey = typeof apiKeyInput === 'string' ? apiKeyInput.trim() : '';
    if (apiKey.length < 8 || apiKey.length > 2048 || !/^[\x21-\x7E]+$/.test(apiKey)) {
      throw new Error('أدخل API Key كاملاً دون مسافات أو أسطر إضافية.');
    }
    const secret = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (secret.length < 32) throw new Error('إعداد التشفير CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل في Vercel.');
    await verifyApiKey(apiKey);
    const existing = await loadIntegration(id);
    const db = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await (db as any).from('merchant_carrier_integrations').upsert({
      merchant_id: id,
      provider: 'elogistia',
      base_url: API,
      credentials_encrypted: encryptElogistiaApiKey(apiKey, id, secret),
      sync_enabled: true,
      connected_at: existing?.connected_at || now,
      last_error: null,
      last_error_at: null,
      updated_at: now,
    }, { onConflict: 'merchant_id,provider' })
      .select('connected_at,last_sync_at,last_success_at,last_error,sync_enabled').single();
    if (error || !data) throw new Error('تم التحقق من API Key، لكن تعذر حفظ الربط. تأكد من تطبيق تحديث قاعدة البيانات.');
    revalidatePath('/merchant');
    return { success: true, status: { connected: true, ...data } };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر ربط حساب Elogistia.' };
  }
}

export async function checkElogistiaConnection() {
  try {
    const id = await merchantId();
    const row = await loadIntegration(id);
    if (!row?.sync_enabled || !row?.credentials_encrypted) throw new Error('لا يوجد حساب Elogistia نشط لاختبار الاتصال.');
    const apiKey = tokenFor(id, String(row.credentials_encrypted));
    await verifyApiKey(apiKey);
    return { success: true, checkedAt: new Date().toISOString() };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل اختبار الاتصال.' };
  }
}

export async function disconnectElogistiaIntegration() {
  try {
    const id = await merchantId();
    const db = getSupabaseAdminClient();
    const { error } = await (db as any).from('merchant_carrier_integrations').delete()
      .eq('merchant_id', id).eq('provider', 'elogistia');
    if (error) throw new Error('تعذر فصل حساب Elogistia.');
    revalidatePath('/merchant');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر فصل الحساب.' };
  }
}

export async function getElogistiaDispatchOptions(wilayaId?: string) {
  try {
    const id = await merchantId();
    const row = await loadIntegration(id);
    if (!row?.sync_enabled || !row?.credentials_encrypted) throw new Error('اربط حساب Elogistia أولاً من قسم التكاملات.');
    const apiKey = tokenFor(id, String(row.credentials_encrypted));
    const tasks: Promise<any>[] = [apiRequest('getWilayas/', 'key', apiKey)];
    if (wilayaId) {
      tasks.push(apiRequest('getMunicipalities/', 'key', apiKey, { wilaya: String(wilayaId) }));
      tasks.push(apiRequest('getShippingCost/', 'key', apiKey));
    }
    const results = await Promise.all(tasks);
    const wilayas = rowsFrom(results[0]).map((item) => ({
      id: String(item.id ?? item.code ?? ''),
      name: String(item.name ?? item.nom ?? item.wilaya ?? '').trim(),
    })).filter((item) => item.id && item.name);
    const communes = wilayaId ? rowsFrom(results[1]).map((item) => ({
      id: item.id == null ? '' : String(item.id),
      name: String(item.name ?? item.nom ?? item.commune ?? '').trim(),
      wilayaId: String(item.wilaya_id ?? item.wilaya ?? wilayaId),
    })).filter((item) => item.name) : [];
    const feeRows = wilayaId ? rowsFrom(results[2]) : [];
    const fee = feeRows.find((item) => String(item.wilaya_id ?? item.wilayaID ?? item.id ?? '') === String(wilayaId));
    const rates = fee ? {
      home: Number(fee.home ?? fee.domicile ?? fee.tarif ?? 0),
      stopDesk: Number(fee.stopdesk ?? fee.stop_desk ?? fee.bureau ?? 0),
    } : null;
    return { success: true, wilayas, communes, rates };
  } catch (error: any) {
    return { success: false, error: error?.message || 'تعذر تحميل ولايات وبلديات Elogistia.' };
  }
}

export async function createElogistiaShipment(orderId: string, input: {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address: string;
  wilayaId: string;
  commune: string;
  product: string;
  codAmount: number;
  deliveryType: 'home' | 'stopdesk';
  deliveryMode: 'standard' | 'exchange';
  note?: string;
  weight?: number | null;
}) {
  let createdTracking = '';
  try {
    const id = await merchantId();
    if (!orderId || typeof orderId !== 'string') throw new Error('الطلب المحدد غير صالح.');
    const db = getSupabaseAdminClient();
    const { data: order, error: orderError } = await (db as any).from('orders')
      .select('id,merchant_id,external_order_id,customer_name,customer_phone,product_name,carrier_name,carrier_tracking_number,carrier_metadata')
      .eq('id', orderId).eq('merchant_id', id).maybeSingle();
    if (orderError || !order) throw new Error('لم نعثر على الطلب داخل متجرك.');
    if (order.carrier_tracking_number) {
      throw new Error('هذا الطلب مرتبط بالفعل برقم تتبع (' + order.carrier_tracking_number + '). لا ننشئ شحنة ثانية تلقائياً.');
    }
    const row = await loadIntegration(id);
    if (!row?.sync_enabled || !row?.credentials_encrypted) throw new Error('اربط حساب Elogistia أولاً من قسم التكاملات.');
    const apiKey = tokenFor(id, String(row.credentials_encrypted));

    const firstName = String(input?.firstName || '').trim();
    const lastName = String(input?.lastName || '').trim();
    const phone = String(input?.phone || '').trim();
    const address = String(input?.address || '').trim();
    const wilayaId = String(input?.wilayaId || '').trim();
    const commune = String(input?.commune || '').trim();
    const product = String(input?.product || '').trim();
    const note = String(input?.note || '').trim().slice(0, 500);
    const email = String(input?.email || '').trim();
    const codAmount = Number(input?.codAmount);
    const weight = input?.weight == null || input.weight === ('' as any) ? null : Number(input.weight);

    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) throw new Error('أدخل الاسم الأول واسم العائلة بشكل صحيح.');
    if (!phone || !/^\+?[0-9\s()-]{8,20}$/.test(phone)) throw new Error('أدخل رقم هاتف صحيحاً للعميل.');
    if (!address || !commune || !wilayaId || !product) throw new Error('أكمل عنوان التوصيل والولاية والبلدية واسم المنتج.');
    if (!Number.isInteger(Number(wilayaId)) || Number(wilayaId) < 1 || Number(wilayaId) > 58) throw new Error('رمز الولاية الذي أعادته Elogistia غير صالح.');
    if (!Number.isFinite(codAmount) || codAmount < 0 || codAmount > 100000000) throw new Error('أدخل مبلغ التحصيل عند التسليم بصورة صحيحة.');
    if (input.deliveryType !== 'home' && input.deliveryType !== 'stopdesk') throw new Error('نوع التوصيل غير صالح.');
    if (input.deliveryMode !== 'standard' && input.deliveryMode !== 'exchange') throw new Error('نوع العملية غير صالح.');
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('البريد الإلكتروني غير صالح.');
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 1000)) throw new Error('وزن الطرد غير صالح.');

    // Elogistia's Postman-based adapter sends these exact fields as query parameters on POST.
    const params: Record<string, string> = {
      name: lastName,
      firstname: firstName,
      phone,
      address,
      commune,
      wilaya: wilayaId,
      modeDeLivraison: input.deliveryMode === 'exchange' ? '4' : '1',
      price: String(Math.round(codAmount)),
      stop_desk: input.deliveryType === 'stopdesk' ? '2' : '1',
      product,
      IdCommande: String(order.external_order_id),
    };
    if (email) params.mail = email;
    if (note) params.remarque = note;
    if (weight !== null) params.poids = String(weight);

    const body = await apiRequest('insertCommande/', 'apiKey', apiKey, params, 'POST');
    const payload = body?.body ?? body?.data ?? body;
    const parcel = Array.isArray(payload) ? payload[0] : payload;
    const tracking = String(parcel?.tracking ?? parcel?.Tracking ?? (typeof parcel?.success === 'string' ? parcel.success : '')).trim();
    if (!tracking) {
      const message = providerError(body);
      throw new Error(message || 'قبلت Elogistia الطلب دون إرجاع رقم تتبع. لم يتم ربطه في تاجر تراك؛ تحقق من لوحة Elogistia قبل إعادة المحاولة.');
    }
    createdTracking = tracking;

    const existingMetadata = order.carrier_metadata && typeof order.carrier_metadata === 'object' ? order.carrier_metadata : {};
    const metadata = {
      ...existingMetadata,
      elogistia: {
        trackingNumber: tracking,
        wilayaId,
        commune,
        address,
        codAmount: Math.round(codAmount),
        deliveryType: input.deliveryType,
        deliveryMode: input.deliveryMode,
        email: email || null,
        shippingFeeHome: null,
        shippingFeeStopDesk: null,
        createdAt: new Date().toISOString(),
      },
    };
    const { error: updateError } = await (db as any).from('orders').update({
      carrier_name: 'Elogistia',
      carrier_tracking_number: tracking,
      carrier_order_id: tracking,
      carrier_metadata: metadata,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('merchant_id', id);
    if (updateError) {
      console.error('[ElogistiaIntegration] Shipment created but order linking failed:', updateError.message);
      return {
        success: false,
        trackingNumber: tracking,
        error: 'أنشأت Elogistia الشحنة ورقم تتبعها ' + tracking + '، لكن تعذر ربطها بطلب تاجر تراك. لا تنشئ شحنة أخرى؛ اربط هذا الرقم يدوياً أو تواصل مع الدعم.',
      };
    }
    revalidatePath('/merchant');
    return { success: true, trackingNumber: tracking };
  } catch (error: any) {
    return { success: false, trackingNumber: createdTracking || undefined, error: error?.message || 'تعذر إنشاء شحنة Elogistia.' };
  }
}
