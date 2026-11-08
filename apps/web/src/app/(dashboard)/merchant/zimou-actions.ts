'use server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import { encryptZimouToken, decryptZimouToken } from '../../../lib/zimou-credentials';
const ZIMOU_API = 'https://zimou.express/api';
async function merchantId(): Promise<string> {
  const auth = await createClient(); const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new Error('انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.');
  const db = getSupabaseAdminClient();
  const { data, error: lookupError } = await db.from('merchants').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (lookupError || !data) throw new Error('تعذر العثور على متجر مرتبط بحسابك.');
  return data.id;
}
async function verifyToken(token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ZIMOU_API + '/v3/user', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
  } catch { throw new Error('تعذر الوصول إلى API الخاص بـ Zimou. تحقق من الاتصال ثم أعد المحاولة.'); }
  if (response.status === 401 || response.status === 403) throw new Error('رفضت Zimou API Token. انسخ الرمز الصحيح من حسابك.');
  if (response.status === 429) throw new Error('Zimou يستقبل طلبات كثيرة حالياً. انتظر قليلاً ثم أعد المحاولة.');
  if (!response.ok) throw new Error('فشل اختبار الاتصال بـ Zimou (HTTP ' + response.status + ').');
  let body: any; try { body = await response.json(); } catch { throw new Error('أعادت Zimou استجابة غير مفهومة.'); }
  if (body && typeof body === 'object' && (body.error === 1 || body.success === false)) throw new Error(String(body.message || 'لم يتمكن Zimou من تأكيد صلاحية الرمز.'));

  let statusesResponse: Response;
  try {
    statusesResponse = await fetch(ZIMOU_API + '/v3/helpers/package-statuses', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('تم قبول الرمز، لكن تعذر الوصول إلى قائمة حالات الطرود المطلوبة للمزامنة.');
  }
  if (!statusesResponse.ok) {
    throw new Error('تم قبول الرمز، لكن تعذر قراءة قائمة حالات Zimou (HTTP ' + statusesResponse.status + '). تحقق من صلاحيات API.');
  }
  let statusesBody: any;
  try { statusesBody = await statusesResponse.json(); } catch {
    throw new Error('أعادت Zimou قائمة حالات غير مفهومة.');
  }
  const statuses = Array.isArray(statusesBody?.data) ? statusesBody.data : Array.isArray(statusesBody) ? statusesBody : [];
  if (!statuses.length || !statuses.some((row: any) => row?.id != null && typeof row?.name === 'string' && row.name.trim())) {
    throw new Error('لم تُرجع Zimou قائمة حالات صالحة لهذا الحساب؛ لم يتم حفظ الربط.');
  }
}
export async function getZimouIntegrationStatus() {
  try {
    const id = await merchantId(); const db = getSupabaseAdminClient();
    const { data, error } = await (db as any).from('merchant_carrier_integrations').select('connected_at,last_sync_at,last_success_at,last_error,sync_enabled').eq('merchant_id', id).eq('provider', 'zimou').maybeSingle();
    if (error) throw new Error('تعذر قراءة حالة ربط Zimou. تأكد من تطبيق تحديث قاعدة البيانات.');
    return { success: true, status: data ? { connected: Boolean(data.sync_enabled), ...data } : { connected: false } };
  } catch (error: any) { return { success: false, status: { connected: false }, error: error?.message || 'تعذر تحميل حالة الربط.' }; }
}
export async function saveZimouIntegration(tokenInput: string) {
  try {
    const id = await merchantId(); const token = typeof tokenInput === 'string' ? tokenInput.trim().replace(/^Bearer\s+/i, '').trim() : '';
    if (token.length < 8 || token.length > 2048 || !/^[\x21-\x7E]+$/.test(token)) throw new Error('أدخل API Token كاملاً دون مسافات أو أسطر إضافية.');
    const key = process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '';
    if (key.length < 32) throw new Error('إعداد التشفير CARRIER_CREDENTIALS_ENCRYPTION_KEY غير مكتمل في Vercel.');
    await verifyToken(token);
    const encrypted = encryptZimouToken(token, id, key); const db = getSupabaseAdminClient();
    const { data, error } = await (db as any).from('merchant_carrier_integrations').upsert({
      merchant_id: id, provider: 'zimou', base_url: ZIMOU_API, credentials_encrypted: encrypted,
      sync_enabled: true, connected_at: new Date().toISOString(), last_sync_at: null, last_success_at: null,
      last_error: null, last_error_at: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'merchant_id,provider' }).select('connected_at,last_sync_at,last_success_at,last_error,sync_enabled').single();
    if (error || !data) throw new Error('تم التحقق من الرمز، لكن تعذر حفظ الربط. تأكد من تطبيق تحديث قاعدة البيانات.');
    revalidatePath('/merchant'); return { success: true, status: { connected: true, ...data } };
  } catch (error: any) { return { success: false, error: error?.message || 'تعذر ربط حساب Zimou.' }; }
}
export async function checkZimouConnection() {
  try {
    const id = await merchantId(); const db = getSupabaseAdminClient();
    const { data, error } = await (db as any).from('merchant_carrier_integrations').select('credentials_encrypted,sync_enabled').eq('merchant_id', id).eq('provider', 'zimou').maybeSingle();
    if (error || !data?.sync_enabled) throw new Error('لا يوجد ربط Zimou نشط لاختباره.');
    const token = decryptZimouToken(data.credentials_encrypted, id, process.env.CARRIER_CREDENTIALS_ENCRYPTION_KEY || '');
    await verifyToken(token); return { success: true, checkedAt: new Date().toISOString() };
  } catch (error: any) { return { success: false, error: error?.message || 'فشل اختبار الاتصال.' }; }
}
export async function disconnectZimouIntegration() {
  try {
    const id = await merchantId(); const db = getSupabaseAdminClient();
    const { error } = await (db as any).from('merchant_carrier_integrations').delete().eq('merchant_id', id).eq('provider', 'zimou');
    if (error) throw new Error('تعذر فصل حساب Zimou.');
    revalidatePath('/merchant'); return { success: true };
  } catch (error: any) { return { success: false, error: error?.message || 'تعذر فصل حساب Zimou.' }; }
}
