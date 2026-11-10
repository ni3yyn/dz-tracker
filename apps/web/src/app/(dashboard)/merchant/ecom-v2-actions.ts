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
function toLocalAlgerianPhone(value: string): string {
  const digits = value.trim().replace(/[\s\-.()/]/g, '');
  let national: string;
  if (digits.startsWith('+213')) national = digits.slice(4);
  else if (digits.startsWith('00213')) national = digits.slice(5);
  else if (digits.startsWith('213') && digits.length >= 11) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  national = national.replace(/^0+/, '');
  if (!/^\d{8,9}$/.test(national)) throw new Error('أدخل رقم هاتف جزائري صحيحاً بصيغة محلية أو دولية.');
  return '0' + national;
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
    const providerMessage = safeMessage(body).replaceAll(auth.apiKey, '[redacted]').replaceAll(auth.apiToken, '[redacted]');
    const e: any = new Error(providerMessage || 'فشل طلب E-com Delivery (HTTP ' + response.status + ').');
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
    return { success: true, status: row ? {
      connected: Boolean(row.sync_enabled && row.credentials_encrypted),
      connected_at: row.connected_at || null,
      sync_enabled: Boolean(row.sync_enabled),
      last_sync_at: row.last_sync_at || null,
      last_success_at: row.last_success_at || null,
      last_error: row.last_error || null,
    } : { connected: false } };
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
