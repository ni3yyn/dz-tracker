import AuthForm from '../AuthForm';
import { createClient } from '../../../lib/supabase-server';

export const metadata = {
  title: 'تسجيل الدخول',
  description: 'سجّل الدخول إلى مساحة عمل متجرك في تاجر تراك.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = typeof params.next === 'string' ? params.next : '';
  let isAuthenticated = false;
  try { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); isAuthenticated = Boolean(user); } catch { isAuthenticated = false; }
  return <AuthForm mode="login" isAuthenticated={isAuthenticated} nextPath={nextPath} />;
}
