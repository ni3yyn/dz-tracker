'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';

const FEATURE_KEY = '__feature_exchange_requests_enabled__';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuthenticatedMerchantId(): Promise<string> {
  const authSupabase = await createClient();
  const { data: { user }, error: authError } = await authSupabase.auth.getUser();
  if (authError || !user) throw new Error('انتهت جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.');
  const supabase = getSupabaseAdminClient();
  const { data: merchant, error } = await supabase.from('merchants').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (error || !merchant) throw new Error('تعذر التحقق من المتجر المرتبط بحسابك.');
  return merchant.id;
}

export async function toggleExchangeRequestsEnabled(enabled: boolean): Promise<{ success?: boolean; error?: string }> {
  try {
    if (typeof enabled !== 'boolean') return { error: 'قيمة إعداد طلبات الاستبدال غير صالحة.' };
    const merchantId = await getAuthenticatedMerchantId();
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('status_mappings').upsert({ merchant_id: merchantId, source_status: FEATURE_KEY, display_status: enabled ? 'true' : 'false' }, { onConflict: 'merchant_id,source_status' });
    if (error) {
      console.error('[ExchangeRequests] Could not save feature setting:', error.message);
      return { error: 'تعذر حفظ الإعداد. حاول مجدداً بعد التأكد من تحديث قاعدة البيانات.' };
    }
    revalidatePath('/merchant');
    return { success: true };
  } catch (error: any) {
    return { error: error?.message || 'تعذر تحديث إعداد طلبات الاستبدال.' };
  }
}

export async function reviewExchangeRequest(requestId: string, status: 'approved' | 'rejected', merchantResponse = ''): Promise<{ success?: boolean; request?: any; error?: string }> {
  try {
    if (!UUID_PATTERN.test(requestId)) return { error: 'معرّف طلب الاستبدال غير صالح.' };
    if (status !== 'approved' && status !== 'rejected') return { error: 'قرار الاستبدال غير صالح.' };
    const response = typeof merchantResponse === 'string' ? merchantResponse.trim() : '';
    if (response.length > 500) return { error: 'يجب ألا يتجاوز الرد 500 حرف.' };
    const merchantId = await getAuthenticatedMerchantId();
    const supabase = getSupabaseAdminClient();
    const { data: pending, error: lookupError } = await (supabase as any).from('order_exchange_requests').select('id').eq('id', requestId).eq('merchant_id', merchantId).eq('status', 'pending').maybeSingle();
    if (lookupError) throw new Error('تعذر تحميل طلب الاستبدال.');
    if (!pending) return { error: 'تمت مراجعة هذا الطلب مسبقاً أو لا يتبع متجرك.' };
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await (supabase as any).from('order_exchange_requests')
      .update({ status, merchant_response: response || null, reviewed_at: now, updated_at: now })
      .eq('id', requestId).eq('merchant_id', merchantId).eq('status', 'pending')
      .select('id, merchant_id, order_id, reason, customer_note, status, merchant_response, created_at, updated_at, reviewed_at').maybeSingle();
    if (updateError || !updated) {
      console.error('[ExchangeRequests] Could not review request:', updateError?.message);
      return { error: 'تعذر حفظ قرار طلب الاستبدال. حدّث الصفحة ثم حاول مجدداً.' };
    }
    revalidatePath('/merchant');
    return { success: true, request: updated };
  } catch (error: any) {
    return { error: error?.message || 'تعذر حفظ قرار طلب الاستبدال.' };
  }
}
