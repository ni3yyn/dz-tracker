'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../lib/supabase-server';
import crypto from 'node:crypto';
import { isCurrentUserAdmin } from '../../../lib/admin-auth';

type AdminActionResult = {
  error?: string;
  success?: boolean;
  newKey?: string;
};

async function denyUnlessAdmin(): Promise<AdminActionResult | null> {
  return await isCurrentUserAdmin()
    ? null
    : { error: 'غير مصرح لك بتنفيذ هذا الإجراء.' };
}

// 1. قبول وتفعيل اشتراك BaridiMob / Chargily
export async function approvePayment(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
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
  if (payment.plan_tier === 'scale') orderLimit = 500;
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
export async function rejectPayment(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
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
export async function manualUpdateSubscription(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const merchantId = formData.get('merchant_id') as string;
  const tier = (formData.get('tier') as string) || 'growth';
  const additionalDays = parseInt((formData.get('days') as string) || '30', 10);
  const customLimitRaw = (formData.get('limit') as string | null)?.trim() || '';
  const customLimit = customLimitRaw ? Number.parseInt(customLimitRaw, 10) : null;
  const resetUsed = formData.get('reset_used') === 'true';

  if (!merchantId) return { error: 'معرّف المتجر مطلوب' };

  const supabase = getSupabaseAdminClient();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + additionalDays);

  const TIER_LIMITS: Record<string, number> = {
    starter: 30,
    basic: 100,
    growth: 200,
    scale: 500,
  };

  const defaultLimit = TIER_LIMITS[tier] || 30;
  let finalLimit = defaultLimit;
  if (customLimit !== null && Number.isSafeInteger(customLimit) && customLimit >= defaultLimit) {
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
export async function toggleMerchantStatus(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
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
export async function regenerateApiKey(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
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


// SMS gateway operations — all actions are restricted to the authorized platform admin.
async function getSmsAdminActorId(): Promise<string | null> {
  const authClient = await createClient();
  const { data } = await authClient.auth.getUser();
  return data.user?.id || null;
}

async function recordSmsAdminEvent(input: {
  job_id?: string | null;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const actorId = await getSmsAdminActorId();
  const { error } = await (supabase as any).from('sms_tracking_admin_events').insert({
    job_id: input.job_id || null,
    actor_id: actorId,
    action: input.action,
    previous_status: input.previous_status || null,
    new_status: input.new_status || null,
    details: input.details || {},
  });
  if (error) console.error('[SmsGatewayAdmin] Could not write audit event:', error.message);
}

export async function setSmsGatewayEnabled(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const raw = formData.get('enabled');
  if (raw !== 'true' && raw !== 'false') return { error: 'قيمة حالة بوابة SMS غير صالحة.' };
  const enabled = raw === 'true';
  const supabase = getSupabaseAdminClient();
  const { data: current, error: readError } = await (supabase as any)
    .from('sms_gateway_control')
    .select('enabled')
    .eq('id', 'primary')
    .maybeSingle();
  if (readError) return { error: 'تعذر قراءة إعداد بوابة SMS.' };

  const { error } = await (supabase as any)
    .from('sms_gateway_control')
    .upsert({
      id: 'primary',
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: await getSmsAdminActorId(),
    }, { onConflict: 'id' });
  if (error) return { error: 'تعذر تحديث حالة بوابة SMS.' };

  if (current?.enabled !== enabled) {
    await recordSmsAdminEvent({
      action: enabled ? 'resume_gateway' : 'pause_gateway',
      previous_status: current?.enabled ? 'enabled' : 'disabled',
      new_status: enabled ? 'enabled' : 'disabled',
    });
  }
  revalidatePath('/admin');
  return { success: true };
}

export async function setSmsGatewayDeviceEnabled(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const deviceId = String(formData.get('device_id') || '');
  const raw = formData.get('enabled');
  const isLegacyDevice = deviceId === 'android-sms-gateway';
  const isNativeDevice = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId);
  if ((!isLegacyDevice && !isNativeDevice) || (raw !== 'true' && raw !== 'false')) {
    return { error: 'بيانات جهاز SMS غير صالحة.' };
  }

  const enabled = raw === 'true';
  const supabase = getSupabaseAdminClient();
  const deviceQuery = (supabase as any)
    .from('sms_gateway_devices')
    .select(isNativeDevice ? 'device_id, enabled, merchant_id, revoked_at' : 'device_id, enabled')
    .eq('device_id', deviceId);
  const { data: device, error: readError } = await deviceQuery.maybeSingle();
  if (readError || !device) return { error: 'تعذر العثور على جهاز SMS.' };
  if (isNativeDevice && device.revoked_at) {
    return { error: 'تم استبدال هذا الهاتف. أعد ربط الهاتف الحالي من تطبيق التاجر بدلاً من تفعيله يدوياً.' };
  }

  let updateQuery = (supabase as any)
    .from('sms_gateway_devices')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('device_id', deviceId);
  if (isNativeDevice) updateQuery = updateQuery.is('revoked_at', null);
  const { error } = await updateQuery;
  if (error) return { error: 'تعذر تحديث حالة جهاز SMS.' };

  if (device.enabled !== enabled) {
    await recordSmsAdminEvent({
      action: enabled ? 'enable_device' : 'disable_device',
      previous_status: device.enabled ? 'enabled' : 'disabled',
      new_status: enabled ? 'enabled' : 'disabled',
      details: { device_id: deviceId },
    });
  }
  revalidatePath('/admin');
  return { success: true };
}

export async function retrySmsTrackingJob(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const jobId = String(formData.get('job_id') || '');
  const forceUnknown = formData.get('force_unknown') === 'true';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    return { error: 'معرّف رسالة SMS غير صالح.' };
  }

  const supabase = getSupabaseAdminClient();
  const { data: job, error: readError } = await (supabase as any)
    .from('sms_tracking_outbox')
    .select('id, status, attempt_count, max_attempts')
    .eq('id', jobId)
    .maybeSingle();

  if (readError || !job) return { error: 'تعذر العثور على رسالة SMS.' };
  const allowed = ['failed', 'dead_letter'].includes(job.status) ||
    (job.status === 'unknown' && forceUnknown);
  if (!allowed) {
    return {
      error: job.status === 'unknown'
        ? 'تأكيد المراجعة مطلوب قبل إعادة رسالة ذات نتيجة مجهولة.'
        : 'يمكن إعادة معالجة الرسائل الفاشلة أو التي استنفدت المحاولات فقط.',
    };
  }

  const now = new Date().toISOString();
  const nextMaxAttempts = Math.max(Number(job.max_attempts) || 3, Number(job.attempt_count) + 3);
  const { data: updated, error: updateError } = await (supabase as any)
    .from('sms_tracking_outbox')
    .update({
      status: 'retry',
      available_at: now,
      max_attempts: nextMaxAttempts,
      result_code: 'admin_manual_retry',
      last_error: job.status === 'unknown'
        ? 'Admin authorized a manual resend after reviewing the unknown outcome; a duplicate SMS is possible.'
        : 'Admin manually re-queued this SMS after reviewing the failed attempts.',
      locked_by: null,
      locked_at: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .eq('id', jobId)
    .eq('status', job.status)
    .select('id')
    .maybeSingle();

  if (updateError || !updated) {
    return { error: 'تغيرت حالة الرسالة أثناء تنفيذ الإجراء. حدّث الصفحة ثم أعد التحقق.' };
  }

  await recordSmsAdminEvent({
    job_id: jobId,
    action: job.status === 'unknown' ? 'force_retry_unknown' : 'retry_job',
    previous_status: job.status,
    new_status: 'retry',
    details: {
      previous_attempt_count: job.attempt_count,
      previous_max_attempts: job.max_attempts,
      new_max_attempts: nextMaxAttempts,
      duplicate_risk_acknowledged: job.status === 'unknown',
    },
  });

  revalidatePath('/admin');
  return { success: true };
}


// Update the sales follow-up state and negotiation notes for a custom plan request.
export async function updateCustomPlanRequest(formData: FormData): Promise<AdminActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const requestId = String(formData.get('request_id') || '').trim();
  const status = String(formData.get('status') || '');
  const adminNotes = String(formData.get('admin_notes') || '').trim();

  if (!requestId) return { error: 'معرّف طلب العرض غير موجود.' };
  if (!['new', 'contacted', 'quoted', 'closed'].includes(status)) {
    return { error: 'حالة المتابعة المحددة غير صالحة.' };
  }
  if (adminNotes.length > 1500) {
    return { error: 'ملاحظات المتابعة طويلة جداً.' };
  }

  const db = getSupabaseAdminClient() as any;
  const { data, error } = await db
    .from('custom_plan_requests')
    .update({
      status,
      admin_notes: adminNotes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('[CustomPlanRequest] Admin update failed:', error?.message || 'Request not found');
    return { error: 'تعذر تحديث طلب العرض. تحقق من تطبيق ترحيل قاعدة البيانات.' };
  }

  revalidatePath('/admin');
  return { success: true };
}
