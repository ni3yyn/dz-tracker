'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase-server';
import { getSupabaseAdminClient } from '@saas/database';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect('/merchant');
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const storeName = formData.get('storeName') as string;

  const supabase = await createClient();
  const adminClient = getSupabaseAdminClient(); // نحتاج لصلاحيات الأدمن لإنشاء التاجر

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  if (data.user) {
    // بمجرد إنشاء الحساب بنجاح، ننشئ له ملف تاجر في النظام
    await adminClient.from('merchants').insert({
      auth_user_id: data.user.id,
      store_name: storeName || email.split('@')[0],
    });
  }

  revalidatePath('/', 'layout');
  redirect('/merchant');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}