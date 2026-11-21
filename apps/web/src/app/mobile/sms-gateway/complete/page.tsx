import styles from '../connect/connect.module.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'فتح تطبيق تاجر تراك فون',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};

const DOWNLOAD_URL = 'https://github.com/ni3yyn/tajertrack-phone/releases/latest/download/tajertrack-phone.apk';

export default async function NativeSmsPairingCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; code?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode === 'manager' || params.mode === 'sender' ? params.mode : '';
  const code = typeof params.code === 'string' && /^[A-Za-z0-9_-]{30,100}$/.test(params.code)
    ? params.code
    : '';
  const valid = Boolean(mode && code);
  const encodedCode = encodeURIComponent(code);
  const intentUrl = valid
    ? `intent://tajertrack.vercel.app/mobile/sms-gateway/complete?mode=${mode}&code=${encodedCode}#Intent;scheme=https;package=com.tajertrack.phone;S.browser_fallback_url=${encodeURIComponent(DOWNLOAD_URL)};end`
    : '';

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
        <p className={styles.eyebrow}>ربط الهاتف</p>
        <h1>{valid ? 'أكمل الربط داخل تطبيق تاجر تراك فون' : 'رابط الربط غير صالح'}</h1>
        <p className={styles.description}>
          {valid
            ? 'اضغط لفتح التطبيق وإكمال اعتماد الهاتف. رمز الربط صالح لمرة واحدة فقط ولمدة قصيرة.'
            : 'لم يصل رمز ربط صالح. ارجع إلى صفحة الربط في تاجر تراك وابدأ العملية من جديد.'}
        </p>
        {valid ? (
          <div className={styles.form}>
            <a className={styles.action} href={intentUrl} referrerPolicy="no-referrer">
              فتح تطبيق تاجر تراك فون
            </a>
            <a className={styles.security} href={DOWNLOAD_URL} rel="noreferrer">
              تنزيل التطبيق عند الحاجة
            </a>
          </div>
        ) : (
          <a className={styles.action} href="/login">العودة إلى تسجيل الدخول</a>
        )}
      </section>
    </main>
  );
}
