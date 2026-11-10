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
  if (response.status === 401 || response.status === 403) {
    const error: any = new Error('رفضت Elogistia API Key. تحقق من المفتاح وصلاحيات الحساب.');
    error.statusCode = response.status;
    error.providerRejected = true;
    throw error;
  }
  if (response.status === 429) {
    const error: any = new Error('وصل حساب Elogistia إلى حد الطلبات. انتظر قليلاً ثم أعد المحاولة.');
    error.statusCode = response.status;
    error.providerRejected = true;
    throw error;
  }
  if (!response.ok || body?.success === false || body?.error) {
    const message = providerError(body).replaceAll(apiKey, '[redacted]');
    const error: any = new Error(message || 'فشل طلب Elogistia (HTTP ' + response.status + ').');
    error.statusCode = response.status;
    error.providerRejected = (response.status >= 400 && response.status < 500 && response.status !== 408) ||
      body?.success === false || Boolean(body?.error);
    throw error;
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
