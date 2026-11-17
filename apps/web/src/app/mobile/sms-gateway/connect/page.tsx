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
  title: 'ربط هاتف تاجر تراك',
  description: 'اربط الهاتف الرئيسي أو أضف هاتفاً لإرسال رسائل التتبع.',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

const MANAGER_REDIRECT = 'tajertrack-sms://manager-pair';
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

  if (!inviteMode && params.redirect_uri !== MANAGER_REDIRECT) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.content}>
          <p className={styles.eyebrow}>تاجر تراك</p>
          <h1>تعذر بدء ربط الهاتف</h1>
          <p className={styles.description}>افتح صفحة الربط من تطبيق TajerTrack Phone أو استخدم رابط الدعوة الذي أنشأه الهاتف الرئيسي.</p>
          <a className={styles.action} href="/merchant">العودة إلى لوحة التاجر</a>
        </section>
      </main>
    );
  }

  const supabase = getSupabaseAdminClient() as any;
  let merchant: any = null;
  let operatorCode: string | null = null;
  let inviteValid = false;
  let managerExists = false;

  if (inviteMode) {
    if (/^[A-Za-z0-9_-]{30,100}$/.test(inviteToken)) {
      const { data: invite } = await supabase
        .from('sms_gateway_device_invites')
        .select('merchant_id, operator_code, expires_at, consumed_at, manager_device_id, created_by')
        .eq('token_hash', hashNativeSmsCredential(inviteToken))
        .maybeSingle();

      inviteValid = Boolean(
        invite &&
        !invite.consumed_at &&
        new Date(invite.expires_at).getTime() > Date.now()
      );

      if (inviteValid && invite) {
        operatorCode = invite.operator_code;

        if (invite.manager_device_id) {
          const { data: manager } = await supabase
            .from('sms_gateway_manager_devices')
            .select('manager_device_id')
            .eq('manager_device_id', invite.manager_device_id)
            .eq('merchant_id', invite.merchant_id)
            .eq('owner_user_id', invite.created_by)
            .eq('enabled', true)
            .is('revoked_at', null)
            .maybeSingle();
          inviteValid = Boolean(manager?.manager_device_id);
        }

        const { data } = await supabase
          .from('merchants')
          .select('id, store_name, logo_url, auth_user_id')
          .eq('id', invite.merchant_id)
          .maybeSingle();
        merchant = data;

        if (inviteValid && merchant?.auth_user_id) {
          const { data: owner } = await supabase.auth.admin.getUserById(merchant.auth_user_id);
          const bannedUntil = owner?.user?.banned_until
            ? new Date(owner.user.banned_until).getTime()
            : 0;
          inviteValid = Boolean(
            owner?.user &&
            !owner.user.deleted_at &&
            (!Number.isFinite(bannedUntil) || bannedUntil <= Date.now())
          );
        } else {
          inviteValid = false;
        }
      }
    }
  } else {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      const next = `/mobile/sms-gateway/connect?redirect_uri=${encodeURIComponent(MANAGER_REDIRECT)}`;
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    if (isAuthorizedAdmin(user)) redirect('/admin');

    const { data } = await supabase
      .from('merchants')
      .select('id, store_name, logo_url')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    merchant = data;

    if (merchant?.id) {
      const { data: manager } = await supabase
        .from('sms_gateway_manager_devices')
        .select('manager_device_id')
        .eq('merchant_id', merchant.id)
        .is('revoked_at', null)
        .limit(1)
        .maybeSingle();
      managerExists = Boolean(manager?.manager_device_id);
    }
  }

  const errorMessage = params.error === 'merchant_unavailable'
    ? 'لم يتم العثور على متجر مرتبط بهذا الحساب.'
    : params.error === 'pairing_unavailable' || params.error === 'invite_unavailable'
      ? 'تعذر إنشاء رابط آمن الآن. حاول مرة أخرى.'
      : params.error === 'invite_expired' || params.error === 'invite_invalid'
        ? 'رابط الدعوة غير صالح أو انتهت صلاحيته أو تم استخدامه مسبقاً. اطلب رابطاً جديداً من الهاتف الرئيسي.'
        : params.error === 'operator_required'
          ? 'اختر شبكة شريحة الإرسال التي ستعمل من هذا الهاتف.'
          : params.error === 'manager_replacement_required'
            ? 'يوجد هاتف رئيسي مرتبط بالفعل. أكّد استبداله قبل المتابعة.'
            : '';

  if (!merchant || (inviteMode && !inviteValid)) {
    return (
      <main className={styles.page} dir="rtl">
        <section className={styles.content}>
          <p className={styles.eyebrow}>تاجر تراك</p>
          <h1>{inviteMode ? 'رابط الدعوة غير متاح' : 'لا يوجد متجر مرتبط'}</h1>
          <p className={styles.description}>
            {inviteMode
              ? errorMessage || 'انتهت صلاحية رابط الربط أو تم استخدامه مسبقاً. اطلب رابطاً جديداً من الهاتف الرئيسي.'
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

        <p className={styles.eyebrow}>{inviteMode ? 'دعوة ربط آمنة' : 'إعداد الهاتف الرئيسي'}</p>
        <h1>{inviteMode ? 'ساهم في إرسال رسائل تتبع الطلبات.' : 'اجعل هذا هاتف متجرك الرئيسي.'}</h1>
        <p className={styles.description}>
          {inviteMode
            ? `سيُربط هذا الهاتف بمتجر ${merchant.store_name} لإرسال رسائل التتبع للعملاء على شبكة ${operatorLabel}. لا تحتاج إلى كلمة مرور صاحب المتجر.`
            : 'الهاتف الرئيسي يدير ربط الهواتف الأخرى، ويمكنه أيضاً إرسال رسائل التتبع من شريحته. يتطلب هذا الإجراء تسجيل الدخول بحساب التاجر.'}
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
            <PairingSubmitButton label="ربط هذا الهاتف كجهاز إرسال" />
          </form>
        ) : (
          <form action={approveNativeSmsDevice} className={styles.form}>
            <div className={styles.selectField}>
              <label htmlFor="operatorCode">شبكة الشريحة الأساسية في هذا الهاتف</label>
              <select id="operatorCode" name="operatorCode" required defaultValue="">
                <option value="" disabled>اختر شبكة الإرسال</option>
                <option value="djezzy">Djezzy</option>
                <option value="mobilis">Mobilis</option>
                <option value="ooredoo">Ooredoo</option>
              </select>
              <p>اختر الشبكة المطابقة للشريحة التي ستستخدمها لإرسال الرسائل. يمكنك إضافة خطوط الشبكات الأخرى لاحقاً من التطبيق.</p>
            </div>
            {managerExists && (
              <div className={styles.confirmField}>
                <label>
                  <input type="checkbox" name="replaceExisting" value="yes" required />
                  <span>أؤكد استبدال الهاتف الرئيسي الحالي. سيفقد الهاتف السابق صلاحية إدارة الأجهزة، وسيتوقف خط الإرسال الرئيسي القديم.</span>
                </label>
              </div>
            )}
            <PairingSubmitButton label={managerExists ? 'استبدال الهاتف الرئيسي' : 'اعتماد هذا الهاتف الرئيسي'} />
          </form>
        )}

        <p className={styles.security}>
          {inviteMode
            ? 'هذا الهاتف يحصل على صلاحية إرسال SMS للشبكة المحددة فقط. لا يمكنه إنشاء دعوات أو إدارة حساب المتجر.'
            : 'صلاحية الإدارة محفوظة لهذا الهاتف فقط. الهواتف التي تربطها لاحقاً تحصل على صلاحية إرسال الرسائل فقط، ولا تحصل على صلاحية حسابك أو إدارة الأجهزة.'}
        </p>
        {!inviteMode && (
          <p className={styles.notice}>
            سيُفتح موقع تاجر تراك في المتصفح. سجّل الدخول بالحساب المرتبط بمتجرك ووافق على جعل هذا الهاتف رئيسياً. بعد العودة إلى التطبيق يمكنك إنشاء دعوات ومشاركتها.
          </p>
        )}
      </section>
    </main>
  );
}
