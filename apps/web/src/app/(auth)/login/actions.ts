'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';
import { isAuthorizedAdmin } from '../../../lib/admin-auth';
import { LEGAL_TERMS_VERSION, LEGAL_PRIVACY_VERSION } from '../../../lib/legal';

function normalizeAlgerianMobileNumber(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().replace(/[\\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('213')) value = `+${value}`;
  if (/^0[5-7]\\d{8}$/.test(value)) value = `+213${value.slice(1)}`;
  return /^\\+213[5-7]\\d{8}$/.test(value) ? value : null;
}

export async function login(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  
  if (!email || !password) {
    return { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    let msg = error.message;
    if (msg.includes('Invalid login credentials')) {
      msg = 'بيانات الدخول غير صحيحة، يرجى التأكد من البريد وكلمة المرور';
    } else if (msg.includes('Email not confirmed')) {
      msg = 'لم يتم تأكيد البريد الإلكتروني بعد. افتح رسالة التأكيد المرسلة إلى بريدك ثم حاول مجدداً.';
    } else if (/invalid email/i.test(msg)) {
      msg = 'تحقق من صيغة البريد الإلكتروني ثم حاول مجدداً.';
    } else if (/rate limit|too many requests/i.test(msg)) {
      msg = 'حدثت محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مجدداً.';
    } else {
      msg = 'تعذر تسجيل الدخول حالياً. تحقق من بياناتك وحاول مجدداً.';
    }
    return { error: msg };
  }

  revalidatePath('/', 'layout');

  if (isAuthorizedAdmin(signInData.user)) {
    redirect('/admin');
  }

  const requestedNext = formData.get('next');
  let safeNextPath: string | null = null;
  if (typeof requestedNext === 'string' && requestedNext.startsWith('/')) {
    try {
      const destination = new URL(requestedNext, 'https://tajertrack.invalid');
      if (
        destination.origin === 'https://tajertrack.invalid' &&
        destination.pathname === '/mobile/sms-gateway/connect'
      ) {
        safeNextPath = `${destination.pathname}${destination.search}`;
      }
    } catch {
      // Ignore malformed or external post-login destinations.
    }
  }

  if (safeNextPath) redirect(safeNextPath);
  redirect('/merchant');
}

export async function signup(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const passwordConfirm = formData.get('passwordConfirm') as string;
  const storeName = (formData.get('storeName') as string)?.trim();
  const merchantPhone = normalizeAlgerianMobileNumber(formData.get('phoneNumber'));

  if (!email || !password) {
    return { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }
  if (formData.get('acceptLegal') !== 'yes') {
    return { error: 'يجب الموافقة على شروط الاستخدام وسياسة الخصوصية لإكمال إنشاء الحساب.' };
  }
  if (!storeName || storeName.length < 2) {
    return { error: 'يرجى إدخال اسم المتجر أو العلامة التجارية' };
  }
  if (!merchantPhone) {
    return { error: 'أدخل رقم هاتف جزائري صحيحاً بصيغة 05 أو 06 أو 07، أو مع رمز الدولة +213.' };
  }
  if (password.length < 6) {
    return { error: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل' };
  }
  if (!passwordConfirm || password !== passwordConfirm) {
    return { error: 'كلمتا المرور غير متطابقتين. تحقق منهما ثم حاول مجدداً.' };
  }

  const supabase = await createClient();
  const adminClient = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        store_name: storeName || email.split('@')[0],
        merchant_phone: merchantPhone,
      },
    },
  });

  if (error) {
    const message = error.message;
    let userMessage = 'تعذر إنشاء الحساب حالياً. تحقق من البيانات وحاول مجدداً.';
    if (/user already registered/i.test(message) || /already been registered/i.test(message)) {
      userMessage = 'يوجد حساب مسجل بهذا البريد الإلكتروني. جرّب تسجيل الدخول بدلاً من إنشاء حساب جديد.';
    } else if (/password should be at least/i.test(message) || /password is too short/i.test(message)) {
      userMessage = 'كلمة المرور قصيرة جداً. استخدم 6 أحرف على الأقل.';
    } else if (/invalid email|unable to validate email/i.test(message)) {
      userMessage = 'تحقق من صيغة البريد الإلكتروني ثم حاول مجدداً.';
    } else if (/rate limit|too many requests/i.test(message)) {
      userMessage = 'وصلت إلى الحد المسموح من المحاولات. انتظر قليلاً ثم حاول مجدداً.';
    } else if (/signups not allowed|signup is disabled/i.test(message)) {
      userMessage = 'التسجيل غير متاح حالياً. تواصل مع مسؤول المنصة.';
    }
    return { error: userMessage };
  }

  if (!data.user) {
    return { error: 'لم يتم إنشاء حساب المستخدم. حاول مرة أخرى.' };
  }

  // Create the merchant record and immutable acceptance audit row server-side.
  const { data: merchant, error: merchantError } = await adminClient
    .from('merchants')
    .upsert(
      {
        auth_user_id: data.user.id,
        store_name: storeName,
        subscription_tier: 'starter',
        subscription_status: 'active',
        max_orders_limit: 30,
      },
      { onConflict: 'auth_user_id' }
    )
    .select('id')
    .single();

  if (merchantError || !merchant) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    return { error: 'تعذر تهيئة مساحة متجرك. لم يكتمل إنشاء الحساب؛ حاول مرة أخرى.' };
  }

  const { error: acceptanceError } = await adminClient
    .from('merchant_legal_acceptances')
    .insert({
      user_id: data.user.id,
      merchant_id: merchant.id,
      terms_version: LEGAL_TERMS_VERSION,
      privacy_version: LEGAL_PRIVACY_VERSION,
      acceptance_source: 'merchant_signup',
    });

  if (acceptanceError) {
    await adminClient.from('merchants').delete().eq('id', merchant.id);
    await adminClient.auth.admin.deleteUser(data.user.id);
    return { error: 'تعذر حفظ موافقتك القانونية بشكل آمن؛ لم يكتمل التسجيل. حاول مرة أخرى.' };
  }

  // إذا تم الدخول المباشر (عند تعطيل تأكيد البريد)
  if (data.session) {
    revalidatePath('/', 'layout');
    if (isAuthorizedAdmin(data.user)) {
      redirect('/admin');
    } else {
      redirect('/merchant');
    }
  }

  // إذا كان خيار Confirm email ما زال مفعلاً في Supabase
  return {
    needsEmailConfirmation: true,
    message: 'تم إنشاء الحساب بنجاح! ✉️ يرجى فتح بريدك الإلكتروني والضغط على رابط التأكيد لتسجيل الدخول.',
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}