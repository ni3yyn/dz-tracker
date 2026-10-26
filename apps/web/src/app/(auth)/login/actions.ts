'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';

export async function login(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  
  if (!email || !password) {
    return { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

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

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  revalidatePath('/', 'layout');

  if (adminEmail && email === adminEmail) {
    redirect('/admin');
  } else {
    redirect('/merchant');
  }
}

export async function signup(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const passwordConfirm = formData.get('passwordConfirm') as string;
  const storeName = (formData.get('storeName') as string)?.trim();

  if (!email || !password) {
    return { error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }
  if (!storeName || storeName.length < 2) {
    return { error: 'يرجى إدخال اسم المتجر أو العلامة التجارية' };
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

  if (data.user) {
    // إنشاء ملف التاجر فوراً في النظام بصلاحيات الأدمن
    await adminClient.from('merchants').upsert(
      {
        auth_user_id: data.user.id,
        store_name: storeName || email.split('@')[0],
        subscription_tier: 'starter',
        subscription_status: 'active',
        max_orders_limit: 30,
      },
      { onConflict: 'auth_user_id' }
    );
  }

  // إذا تم الدخول المباشر (عند تعطيل تأكيد البريد)
  if (data.session) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    revalidatePath('/', 'layout');
    if (adminEmail && email === adminEmail) {
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