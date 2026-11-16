import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@saas/database';
import { createClient } from '../../../../lib/supabase-server';
import { isAuthorizedAdmin } from '../../../../lib/admin-auth';
import { hashNativeSmsCredential } from '../../../../lib/native-sms-gateway-auth';
import { approveNativeSmsDevice, approveNativeSmsInvite } from './actions';
import PairingSubmitButton from './PairingSubmitButton';
import styles from './connect.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ربط هاتف إرسال الرسائل',
  description: 'اربط هاتف Android بخط إرسال SMS الخاص بمتجرك في تاجر تراك.',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

const APP_REDIRECT = 'tajertrack-sms://pair';
const OPERATOR_LABELS: Record<string, string> = {
  djezzy: 'Djezzy',
  mobilis: 'Mobilis',
  ooredoo: 'Ooredoo',
};

export default async function ConnectNativeSmsPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; error?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const inviteToken = typeof params.invite === 'string' ? params.invite.trim() : '';
  const inviteMode = Boolean(inviteToken);

  if (!inviteMode && params.redirect_uri !== APP_REDIRECT) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.content}>
          <p className={styles.eyebrow}>تاجر تراك</p>
          <h1>تعذر بدء ربط الهاتف</h1>
          <p className={styles.description}>افتح صفحة الربط من تطبيق TajerTrack Phone أو استخدم رابط الدعوة الذي أنشأه صاحب المتجر.</p>
          <a className={styles.action} href="/merchant">العودة إلى لوحة التاجر</a>
        </section>
      </main>
    );
  }

  const supabase = getSupabaseAdminClient() as any;
  let merchant: any = null;
  let operatorCode: string | null = null;
  let inviteValid = false;

  if (inviteMode) {
    if (/^[A-Za-z0-9_-]{30,100}$/.test(inviteToken)) {
      const { data: invite } = await supabase
        .from('sms_gateway_device_invites')
        .select('merchant_id, operator_code, expires_at, consumed_at')
        .eq('token_hash', hashNativeSmsCredential(inviteToken))
        .maybeSingle();

      inviteValid = Boolean(
        invite &&
        !invite.consumed_at &&
        new Date(invite.expires_at).getTime() > Date.now()
      );

      if (inviteValid && invite) {
        operatorCode = invite.operator_code;
        const { data } = await supabase
          .from('merchants')
          .select('id, store_name, logo_url')
          .eq('id', invite.merchant_id)
          .maybeSingle();
        merchant = data;
      }
    }
  } else {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      const next = `/mobile/sms-gateway/connect?redirect_uri=${encodeURIComponent(APP_REDIRECT)}`;
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    if (isAuthorizedAdmin(user)) redirect('/admin');

    const { data } = await supabase
      .from('merchants')
      .select('id, store_name, logo_url')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    merchant = data;
  }

  const errorMessage = params.error === 'merchant_unavailable'
    ? 'لم يتم العثور على متجر مرتبط بهذا الحساب.'
    : params.error === 'pairing_unavailable' || params.error === 'invite_unavailable'
      ? 'تعذر إنشاء رابط آمن الآن. حاول مرة أخرى.'
      : params.error === 'invite_expired' || params.error === 'invite_invalid'
          ? 'رابط الدعوة غير صالح أو انتهت صلاحيته أو تم استخدامه مسبقاً. اطلب رابطاً جديداً من صاحب المتجر.'
          : '';

  if (!merchant || (inviteMode && !inviteValid)) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.content}>
          <p className={styles.eyebrow}>تاجر تراك</p>
          <h1>{inviteMode ? 'رابط الدعوة غير متاح' : 'لا يوجد متجر مرتبط'}</h1>
          <p className={styles.description}>
            {inviteMode
              ? errorMessage || 'انتهت صلاحية رابط الربط أو تم استخدامه مسبقاً. اطلب رابطاً جديداً من صاحب المتجر.'
              : 'سجّل الدخول بالحساب المرتبط بمتجرك، ثم أعد فتح الربط من التطبيق.'}
          </p>
          {!inviteMode && <a className={styles.action} href="/login">تسجيل الدخول</a>}
        </section>
      </main>
    );
  }

  const operatorLabel = operatorCode ? OPERATOR_LABELS[operatorCode] : null;

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

        <p className={styles.eyebrow}>{inviteMode ? 'دعوة ربط آمنة' : 'ربط جهاز جديد'}</p>
        <h1>{inviteMode ? 'ساهم في إرسال رسائل تتبع الطلبات.' : 'إرسال رسائل الطلبات من شريحتك.'}</h1>
        <p className={styles.description}>
          {inviteMode
            ? `سيُربط هذا الهاتف بمتجر ${merchant.store_name} لإرسال رسالة واحدة فقط للعملاء الذين يستخدمون شبكة ${operatorLabel}. لا تحتاج إلى كلمة مرور صاحب المتجر.`
            : 'سيستخدم هذا الهاتف شريحة الاتصال المختارة لإرسال رابط تتبع واحد عند إنشاء طلب جديد في متجرك.'}
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
          {operatorLabel && (
            <p className={styles.security} style={{ marginTop: 12 }}>
              شبكة الإرسال المخصصة لهذا الخط: <strong>{operatorLabel}</strong>
            </p>
          )}
        </div>

        {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}

        {inviteMode ? (
          <form action={approveNativeSmsInvite} className={styles.form}>
            <input type="hidden" name="invite" value={inviteToken} />
            <PairingSubmitButton />
          </form>
        ) : (
          <form action={approveNativeSmsDevice} className={styles.form}>
            <PairingSubmitButton />
          </form>
        )}

        <p className={styles.security}>
          {inviteMode
            ? 'بموافقتك، ستسمح للتطبيق باستخدام صلاحية إرسال SMS على هذا الهاتف لهذا المتجر فقط. يمكنك إيقاف الإرسال أو إزالة الخط لاحقاً.'
            : 'لن نطلب كلمة مرورك داخل التطبيق، ولن نرسل الرسائل من رقم مشترك تابع لتاجر تراك.'}
        </p>
        {!inviteMode && (
          <p className={styles.notice}>
            سيستمر هذا الربط القديم في العمل كما هو. لإضافة خطوط Djezzy وMobilis وOoredoo مستقلة، أنشئ دعوة للشبكة المطلوبة من إعدادات المتجر.
          </p>
        )}
      </section>
    </main>
  );
}
