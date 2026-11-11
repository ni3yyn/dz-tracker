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
    const { data, error } = await (supabase as any).rpc('review_order_exchange_request', {
      p_request_id: requestId,
      p_merchant_id: merchantId,
      p_status: status === 'approved' ? 'awaiting_shipment' : 'rejected',
      p_merchant_response: response || null,
    });
    const updated = Array.isArray(data) ? data[0] : data;
    if (error || !updated) {
      console.error('[ExchangeRequests] Could not review request:', error?.message);
      return { error: 'تعذر حفظ قرار طلب الاستبدال. تأكد من تطبيق تحديث قاعدة البيانات ثم حاول مجدداً.' };
    }
    revalidatePath('/merchant');
    return { success: true, request: updated };
  } catch (error: any) {
    return { error: error?.message || 'تعذر حفظ قرار طلب الاستبدال.' };
  }
}


export async function confirmExchangeShipmentMatch(shipmentId: string, exchangeRequestId: string): Promise<{ success?: boolean; shipment?: any; error?: string }> {
  try {
    if (!UUID_PATTERN.test(shipmentId) || !UUID_PATTERN.test(exchangeRequestId)) {
      return { error: 'معرّف الشحنة أو طلب الاستبدال غير صالح.' };
    }
    const merchantId = await getAuthenticatedMerchantId();
    const { data, error } = await (getSupabaseAdminClient() as any).rpc('confirm_order_exchange_shipment_match', {
      p_shipment_id: shipmentId,
      p_exchange_request_id: exchangeRequestId,
      p_merchant_id: merchantId,
    });
    const shipment = Array.isArray(data) ? data[0] : data;
    if (error || !shipment) {
      console.error('[ExchangeRequests] Could not confirm replacement match:', error?.message);
      return { error: 'تعذر ربط الشحنة بطلب الاستبدال. ربما تمت معالجة الشحنة مسبقاً.' };
    }
    revalidatePath('/merchant');
    return { success: true, shipment };
  } catch (error: any) {
    return { error: error?.message || 'تعذر تأكيد ربط شحنة الاستبدال.' };
  }
}
