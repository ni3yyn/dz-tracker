'use server';

import { getSupabaseAdminClient } from '@saas/database';

type CustomPlanRequestResult = {
  success?: boolean;
  error?: string;
};

export async function submitCustomPlanRequest(formData: FormData): Promise<CustomPlanRequestResult> {
  const honeypot = String(formData.get('website') || '').trim();
  if (honeypot) return { success: true };

  const fullName = String(formData.get('full_name') || '').trim();
  const storeName = String(formData.get('store_name') || '').trim();
  const contactPhone = String(formData.get('contact_phone') || '').trim();
  const preferredContactMethod = String(formData.get('preferred_contact_method') || 'whatsapp');
  const monthlyTrackingUrls = Number(formData.get('monthly_tracking_urls'));
  const carrierNames = String(formData.get('carrier_names') || '').trim();
  const requirements = String(formData.get('requirements') || '').trim();

  if (fullName.length < 2 || fullName.length > 100) {
    return { error: 'أدخل الاسم الكامل (من حرفين إلى 100 حرف).' };
  }
  if (storeName.length < 2 || storeName.length > 120) {
    return { error: 'أدخل اسم المتجر (من حرفين إلى 120 حرفاً).' };
  }
  if (!/^[+\d\s()\-]{8,24}$/.test(contactPhone) || contactPhone.replace(/\D/g, '').length < 8) {
    return { error: 'أدخل رقم هاتف أو واتساب صحيحاً للتواصل معك.' };
  }
  if (!Number.isSafeInteger(monthlyTrackingUrls) || monthlyTrackingUrls < 1 || monthlyTrackingUrls > 2000000) {
    return { error: 'أدخل عدداً صحيحاً من رابط تتبّع واحد إلى مليوني رابط شهرياً.' };
  }
  if (monthlyTrackingUrls <= 500 && requirements.length < 5) {
    return { error: 'للطلبات التي لا تتجاوز 500 رابط، اشرح الاحتياج الخاص الذي يتطلب باقة مخصصة.' };
  }
  if (!['whatsapp', 'phone'].includes(preferredContactMethod)) {
    return { error: 'طريقة التواصل المحددة غير صالحة.' };
  }
  if (carrierNames.length > 300 || requirements.length > 1500) {
    return { error: 'تجاوزت إحدى الرسائل الحد المسموح.' };
  }

  const db = getSupabaseAdminClient() as any;
  const recentSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentRequest, error: recentError } = await db
    .from('custom_plan_requests')
    .select('id')
    .eq('contact_phone', contactPhone)
    .gte('created_at', recentSince)
    .limit(1)
    .maybeSingle();

  if (!recentError && recentRequest) {
    return { error: 'وصلنا طلب حديث بهذا الرقم. سنعاود التواصل معك قريباً.' };
  }

  const { error } = await db.from('custom_plan_requests').insert({
    full_name: fullName,
    store_name: storeName,
    contact_phone: contactPhone,
    preferred_contact_method: preferredContactMethod,
    monthly_tracking_urls: monthlyTrackingUrls,
    carrier_names: carrierNames || null,
    requirements: requirements || null,
    status: 'new',
  });

  if (error) {
    console.error('[CustomPlanRequest] Failed to save a quote request:', error.message);
    return { error: 'تعذر إرسال طلبك حالياً. يرجى المحاولة بعد قليل.' };
  }

  return { success: true };
}
