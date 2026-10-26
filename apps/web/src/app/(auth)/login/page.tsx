import AuthForm from '../AuthForm';
import { createClient } from '../../../lib/supabase-server';

export const metadata = {
  title: 'تسجيل الدخول',
  description: 'سجّل الدخول إلى مساحة عمل متجرك في تاجر تراك.',
};

export default async function LoginPage() {
  let isAuthenticated = false;
  try { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); isAuthenticated = Boolean(user); } catch { isAuthenticated = false; }
  return <AuthForm mode="login" isAuthenticated={isAuthenticated} />;
}
