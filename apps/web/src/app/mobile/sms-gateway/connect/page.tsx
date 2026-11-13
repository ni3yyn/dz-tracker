import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../lib/admin-auth';
import { approveNativeSmsDevice } from './actions';
import styles from './connect.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ربط هاتف إرسال الرسائل',
  description: 'اربط هاتفك بمتجر تاجر تراك لإرسال روابط تتبع الطلبات من شريحتك.',
};

const APP_REDIRECT = 'tajertrack-sms://pair';

export default async function ConnectNativeSmsPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (params.redirect_uri !== APP_REDIRECT) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.content}>
          <p className={styles.eyebrow}>تاجر تراك</p>
          <h1>تعذر بدء ربط الهاتف</h1>
          <p className={styles.description}>افتح صفحة الربط من تطبيق TajerTrack Phone حتى نتمكن من إكمال الاتصال بأمان.</p>
          <a className={styles.action} href="/merchant">العودة إلى لوحة التاجر</a>
        </section>
      </main>
    );
  }

  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    const next = `/mobile/sms-gateway/connect?redirect_uri=${encodeURIComponent(APP_REDIRECT)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (isAuthorizedAdmin(user)) redirect('/admin');

  const supabase = getSupabaseAdminClient() as any;
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id, store_name, logo_url')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const errorMessage = params.error === 'merchant_unavailable'
    ? 'لم يتم العثور على متجر مرتبط بهذا الحساب.'
    : params.error === 'pairing_unavailable'
      ? 'تعذر إنشاء رابط آمن الآن. حاول مرة أخرى.'
      : params.error === 'invalid_phone'
        ? 'أدخل رقم هاتف جزائري صحيحاً قبل ربط الهاتف.'
        : params.error === 'phone_save_failed'
          ? 'تعذر حفظ رقم الهاتف في حسابك. لم يتم ربط الجهاز؛ حاول مرة أخرى.'
          : '';

  if (merchantError || !merchant) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.content}>
          <p className={styles.eyebrow}>تاجر تراك</p>
          <h1>لا يوجد متجر مرتبط</h1>
          <p className={styles.description}>سجّل الدخول بالحساب المرتبط بمتجرك، ثم أعد فتح الربط من التطبيق.</p>
          <a className={styles.action} href="/login">تسجيل الدخول</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} dir="rtl">
      <section className={styles.content}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M4 7h14c8 0 8 9 0 9h-7c-7 0-7 9 0 9h13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="4" cy="7" r="2" fill="#D57955" />
              <circle cx="24" cy="25" r="2" fill="currentColor" />
            </svg>
          </span>
          <span>تاجر تراك</span>
        </div>

        <p className={styles.eyebrow}>ربط جهاز جديد</p>
        <h1>إرسال رسائل الطلبات من شريحتك.</h1>
        <p className={styles.description}>
          سيستخدم هذا الهاتف شريحة الاتصال المختارة لإرسال رابط تتبع واحد عند إنشاء طلب جديد في متجرك.
        </p>

        <div className={styles.store}>
          <span className={styles.storeLabel}>المتجر الذي سيتم ربطه</span>
          <div className={styles.storeIdentity}>
            {typeof merchant.logo_url === 'string' && merchant.logo_url.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.storeLogo} src={merchant.logo_url} alt={`شعار ${merchant.store_name}`} />
            ) : (
              <span className={styles.storeLogoFallback} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 9.5 5.5 4h13L20 9.5M5 10v9h14v-9M9 19v-5h6v5M4 9.5c0 1.4 1 2.5 2.4 2.5S9 10.9 9 9.5c0 1.4 1.1 2.5 2.5 2.5S14 10.9 14 9.5c0 1.4 1.1 2.5 2.5 2.5S19 10.9 19 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            <strong>{merchant.store_name}</strong>
          </div>
        </div>

        {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}

        <form action={approveNativeSmsDevice} className={styles.form}>
            <div className={styles.phoneField}>
              <label htmlFor="merchant-phone">رقم هاتفك لاستقبال رسالة الاختبار</label>
              <input
                id="merchant-phone"
                name="phoneNumber"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                maxLength={16}
                required
                defaultValue={typeof user.user_metadata?.merchant_phone === 'string' ? user.user_metadata.merchant_phone : ''}
                placeholder="05xxxxxxxx"
              />
              <p>سيُحفظ هذا الرقم في حسابك، وستُرسل إليه رسالة الاختبار من الشريحة التي تختارها.</p>
            </div>
            <button className={styles.action} type="submit">ربط هذا الهاتف</button>
        </form>

        <p className={styles.notice}>
          ربط هاتف جديد سيوقف الإرسال من الهاتف السابق لهذا المتجر. يمكنك إيقاف الإرسال من التطبيق في أي وقت.
        </p>
        <p className={styles.security}>لن نطلب كلمة مرورك داخل التطبيق، ولن نرسل الرسائل من رقم مشترك تابع لتاجر تراك.</p>
      </section>
    </main>
  );
}
