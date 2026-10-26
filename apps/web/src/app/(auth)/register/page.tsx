import AuthForm from '../AuthForm';
import { createClient } from '../../../lib/supabase-server';

export const metadata = {
  title: 'إنشاء حساب تاجر',
  description: 'أنشئ حساب متجرك وابدأ تنظيم تجربة تتبّع الطلبات مع تاجر تراك.',
};

export default async function RegisterPage() {
  let isAuthenticated = false;
  try { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); isAuthenticated = Boolean(user); } catch { isAuthenticated = false; }
  return <AuthForm mode="register" isAuthenticated={isAuthenticated} />;
}
