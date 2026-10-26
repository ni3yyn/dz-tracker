'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import crypto from 'node:crypto';

// 1. قبول وتفعيل اشتراك BaridiMob / Chargily
export async function approvePayment(formData: FormData) {
  const paymentId = formData.get('payment_id') as string;
  const adminNotes = (formData.get('admin_notes') as string) || 'تم التحقق من الوصل والموافقة عليه بنجاح';

  if (!paymentId) return { error: 'معرّف الدفعة مفقود' };

  const supabase = getSupabaseAdminClient();

  // جلب تفاصيل الدفعة
  const { data: payment, error: pError } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (pError || !payment) {
    return { error: 'تعذر العثور على سجل الدفع' };
  }

  // تحديد سقف الطلبات بناءً على الباقة
  let orderLimit = 200;
  if (payment.plan_tier === 'scale') orderLimit = 999999;
  if (payment.plan_tier === 'growth') orderLimit = 200;
  if (payment.plan_tier === 'basic') orderLimit = 100;
  if (payment.plan_tier === 'starter') orderLimit = 30;

  // حساب تاريخ الانتهاء (30 يوماً من الآن)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // تحديث حالة التاجر وإعادة تصفير العداد للشهر الجديد
  const { error: mError } = await supabase
    .from('merchants')
    .update({
      subscription_tier: payment.plan_tier,
      subscription_status: 'active',
      max_orders_limit: orderLimit,
      monthly_orders_used: 0,
      subscription_expires_at: expiresAt.toISOString(),
    })
    .eq('id', payment.merchant_id);

  if (mError) {
    return { error: 'فشل تحديث اشتراك المتجر' };
  }

  // تحديث سجل الدفعة
  await supabase
    .from('subscription_payments')
    .update({
      status: 'approved',
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  revalidatePath('/admin');
  revalidatePath('/merchant');
  return { success: true };
}

// 2. رفض وصل الدفع
export async function rejectPayment(formData: FormData) {
  const paymentId = formData.get('payment_id') as string;
  const adminNotes = (formData.get('admin_notes') as string) || 'تعذر تأكيد عملية التحويل، يرجى إعادة إرسال وصل واضح';

  if (!paymentId) return { error: 'معرّف الدفعة مفقود' };

  const supabase = getSupabaseAdminClient();

  await supabase
    .from('subscription_payments')
    .update({
      status: 'rejected',
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  revalidatePath('/admin');
  return { success: true };
}

// 3. تعديل وتمديد اشتراك المتجر يدوياً (Manual Subscription Override)
export async function manualUpdateSubscription(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const tier = (formData.get('tier') as string) || 'growth';
  const additionalDays = parseInt((formData.get('days') as string) || '30', 10);
  const customLimit = parseInt((formData.get('limit') as string) || '1500', 10);
  const resetUsed = formData.get('reset_used') === 'true';

  if (!merchantId) return { error: 'معرّف المتجر مطلوب' };

  const supabase = getSupabaseAdminClient();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + additionalDays);

  const TIER_LIMITS: Record<string, number> = {
    starter: 30,
    basic: 100,
    growth: 200,
    scale: 999999,
  };

  const defaultLimit = TIER_LIMITS[tier] || 30;
  let finalLimit = defaultLimit;
  if (tier === 'scale') {
    finalLimit = 999999;
  } else if (customLimit && !isNaN(customLimit) && customLimit > 0) {
    finalLimit = customLimit;
  }

  const updateData: {
    subscription_tier: string;
    subscription_status: string;
    max_orders_limit: number;
    subscription_expires_at: string;
    monthly_orders_used?: number;
  } = {
    subscription_tier: tier,
    subscription_status: 'active',
    max_orders_limit: finalLimit,
    subscription_expires_at: expiresAt.toISOString(),
    ...(resetUsed ? { monthly_orders_used: 0 } : {}),
  };

  const { error } = await supabase
    .from('merchants')
    .update(updateData)
    .eq('id', merchantId);

  if (error) {
    return { error: 'حدث خطأ أثناء تعديل الاشتراك' };
  }

  revalidatePath('/admin');
  revalidatePath('/merchant');
  return { success: true };
}

// 4. تجميد / تفعيل حساب المتجر (Suspend / Activate)
export async function toggleMerchantStatus(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  const currentStatus = formData.get('current_status') as string;

  if (!merchantId) return { error: 'معرّف المتجر مطلوب' };

  const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  const supabase = getSupabaseAdminClient();

  await supabase
    .from('merchants')
    .update({ subscription_status: nextStatus })
    .eq('id', merchantId);

  revalidatePath('/admin');
  return { success: true };
}

// 5. تجديد مفتاح الـ API
export async function regenerateApiKey(formData: FormData) {
  const merchantId = formData.get('merchant_id') as string;
  if (!merchantId) return { error: 'معرّف المتجر مطلوب' };

  const newKey = `dz_live_${crypto.randomBytes(16).toString('hex')}`;
  const supabase = getSupabaseAdminClient();

  await supabase
    .from('merchants')
    .update({ api_key: newKey })
    .eq('id', merchantId);

  revalidatePath('/admin');
  return { success: true, newKey };
}

// 6. تسجيل الخروج من لوحة الإدارة
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

