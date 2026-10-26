'use client';

import React, { useId, useState } from 'react';
import { login, signup } from './login/actions';
import styles from './auth.module.css';
import SiteHeader from '../SiteHeader';

type AuthMode = 'login' | 'register';

function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden
    ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.5 5.2 8.5 5.2a9.8 9.8 0 0 1-2.4 2.9M6.2 6.2C3.9 7.7 2.5 10.2 2.5 10.2S5.8 18 12 18c1.2 0 2.3-.3 3.3-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S5.8 5.5 12 5.5 21.5 12 21.5 12 18.2 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/></svg>;
}

function RouteVisual({ mode }: { mode: AuthMode }) {
  return (
    <aside className={styles.visualPanel} aria-label="عن تاجر تراك">
      <div className={styles.visualPattern} aria-hidden="true">
        <svg viewBox="0 0 540 760" preserveAspectRatio="xMidYMid slice" fill="none">
          <path d="M-40 170C100 170 68 292 206 292S306 390 445 390 500 495 595 495" stroke="rgba(41,75,55,.28)" strokeWidth="1.3" strokeDasharray="3 9" />
          <path d="M-60 540C96 540 123 425 228 425S355 530 590 260" stroke="rgba(41,75,55,.17)" strokeWidth="1" />
          <circle cx="-40" cy="170" r="6" fill="#D57955"/><circle cx="206" cy="292" r="5" fill="#71886F"/><circle cx="445" cy="390" r="6" fill="#D57955"/><circle cx="228" cy="425" r="4" fill="#71886F"/>
          <circle cx="270" cy="360" r="220" stroke="rgba(41,75,55,.13)"/><circle cx="270" cy="360" r="172" stroke="rgba(41,75,55,.10)" strokeDasharray="2 7"/>
        </svg>
      </div>
      <div className={styles.visualTop}><span className={styles.visualEyebrow}>تجربة تتبّع الطلبات</span><span className={styles.visualBadge} aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M4 8h16c9 0 9 11 0 11h-9c-8 0-8 9 0 9h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="4" cy="8" r="2" fill="#D57955"/><circle cx="24" cy="28" r="2" fill="currentColor"/></svg></span></div>
      <div className={styles.visualCopy}>
        <span className={styles.visualKicker}>{mode === 'login' ? 'مرحباً بعودتك' : 'ابدأ من هنا'}</span>
        <h2>{mode === 'login' ? <>كل طلب له مسار.<br /><em>وتحديثه هنا واضح.</em></> : <>اربط متجرك.<br /><em>ووضّح رحلة الطلب.</em></>}</h2>
        <p>{mode === 'login' ? 'راجع الطلبات وآخر الحالات، وأدر تحديثات الشحن من لوحة التاجر.' : 'اربط موقعك عبر SDK أو أضف رابط Webhook إلى Shopify أو شركة توصيل مدعومة، ثم أرسل لعميلك رابط التتبّع عبر Telegram.'}</p>
      </div>
      <div className={styles.visualJourney}>
        <div className={styles.journeyHead}><span>رحلة الشحنة</span><span>مثال توضيحي</span></div>
        <div className={styles.journeyStep}><span className={`${styles.journeyNode} ${styles.journeyNodeDone}`}><i /></span><span><b>تم تجهيز الطلب</b><small>البيانات الأساسية جاهزة</small></span><span className={styles.journeyCheck}>✓</span></div>
        <div className={styles.journeyConnector} />
        <div className={styles.journeyStep}><span className={`${styles.journeyNode} ${styles.journeyNodeCurrent}`}><i /></span><span><b>في طريقه إلى العميل</b><small>آخر تحديث مسجّل</small></span><span className={styles.journeyLive}>الآن</span></div>
        <div className={styles.journeyConnector} />
        <div className={styles.journeyStep}><span className={styles.journeyNode}><i /></span><span><b>تم التسليم</b><small>عند تسجيل وصول الشحنة</small></span></div>
      </div>
      <div className={styles.visualFooter}><span>وضوح في كل خطوة</span><span className={styles.visualFooterLine} /><span dir="ltr">01 — 03</span></div>
    </aside>
  );
}

export default function AuthForm({ mode, isAuthenticated = false }: { mode: AuthMode; isAuthenticated?: boolean }) {
  const emailId = useId();
  const storeId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const isLogin = mode === 'login';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setInfoMsg(null);
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);

    if (!isLogin) {
      const password = String(formData.get('password') ?? '');
      const confirmPassword = String(formData.get('passwordConfirm') ?? '');
      if (password !== confirmPassword) {
        setError('كلمتا المرور غير متطابقتين. تحقق منهما ثم حاول مجدداً.');
        return;
      }
    }

    setLoading(true);
    try {
      const result = isLogin ? await login(formData) : await signup(formData);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      } else if (result && 'needsEmailConfirmation' in result && result.needsEmailConfirmation) {
        setInfoMsg(result.message);
        formElement.reset();
      } else {
        setError('لم نتمكن من إكمال العملية. حاول مرة أخرى.');
      }
    } catch {
      setError('حدث خطأ غير متوقع. تحقق من اتصالك وحاول مجدداً.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.authScreen}>
      <div className={styles.authPageHeader}><SiteHeader isAuthenticated={isAuthenticated} compact /></div>
      <div className={styles.authShell}>
        <section className={styles.authContent} aria-labelledby="auth-title">
          <div className={styles.headingGroup}>
            <span className={styles.headingEyebrow}>{isLogin ? 'مساحة التاجر' : 'ابدأ مع تاجر تراك'}</span>
            <h1 id="auth-title">{isLogin ? 'أهلاً بعودتك.' : 'أنشئ حساب متجرك.'}</h1>
            <p>{isLogin ? 'سجّل الدخول لمتابعة الشحنات وإدارة تجربة عملائك.' : 'أدخل بيانات متجرك لبدء تنظيم الشحنات وصفحات التتبّع.'}</p>
          </div>

          {error && <div className={styles.alertError} role="alert"><span className={styles.alertIcon}>!</span><span>{error}</span></div>}
          {infoMsg && <div className={styles.alertSuccess} role="status"><span className={styles.alertIcon}>✓</span><span>{infoMsg}</span></div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            {!isLogin && (
              <div className={styles.field}>
                <label htmlFor={storeId}>اسم المتجر أو العلامة التجارية</label>
                <input id={storeId} type="text" name="storeName" required minLength={2} autoComplete="organization" placeholder="مثال: متجر النخبة" className={styles.input} disabled={loading} />
              </div>
            )}
            <div className={styles.field}>
              <label htmlFor={emailId}>البريد الإلكتروني</label>
              <input id={emailId} type="email" name="email" required autoComplete="email" inputMode="email" placeholder="name@domain.com" dir="ltr" className={styles.input} disabled={loading} />
            </div>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor={passwordId}>كلمة المرور</label>
                {isLogin && <span className={styles.passwordHint}>٦ أحرف على الأقل</span>}
              </div>
              <div className={styles.passwordWrap} dir="ltr">
                <input id={passwordId} type={showPassword ? 'text' : 'password'} name="password" required minLength={6} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="••••••••" className={styles.input} disabled={loading} />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPassword} disabled={loading}><EyeIcon hidden={showPassword} /></button>
              </div>
            </div>
            {!isLogin && (
              <div className={styles.field}>
                <label htmlFor={confirmId}>تأكيد كلمة المرور</label>
                <div className={styles.passwordWrap} dir="ltr">
                  <input id={confirmId} type={showPassword ? 'text' : 'password'} name="passwordConfirm" required minLength={6} autoComplete="new-password" placeholder="أعد كتابة كلمة المرور" className={styles.input} disabled={loading} />
                  <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'إخفاء كلمات المرور' : 'إظهار كلمات المرور'} aria-pressed={showPassword} disabled={loading}><EyeIcon hidden={showPassword} /></button>
                </div>
              </div>
            )}
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? <><span className={styles.spinner} aria-hidden="true" /><span>{isLogin ? 'جارٍ تسجيل الدخول…' : 'جارٍ إنشاء الحساب…'}</span></> : <><span>{isLogin ? 'تسجيل الدخول' : 'إنشاء حساب التاجر'}</span><ArrowIcon /></>}
            </button>
            <p className={styles.formNote}>{isLogin ? 'بدخولك، ستعود إلى مساحة عمل متجرك.' : 'استخدم بريداً إلكترونياً يمكنك الوصول إليه لإكمال التسجيل إذا طُلب التأكيد.'}</p>
          </form>

          <div className={styles.modeSwitch}>
            <span>{isLogin ? 'جديد على تاجر تراك؟' : 'لديك حساب بالفعل؟'}</span>
            <a href={isLogin ? '/register' : '/login'}>{isLogin ? 'أنشئ حساباً' : 'سجّل الدخول'} <span aria-hidden="true">↗</span></a>
          </div>
          <div className={styles.contentFooter}><span>© تاجر تراك TajerTrack</span><span>تتبّع أوضح. إدارة أهدأ.</span></div>
        </section>
        <RouteVisual mode={mode} />
      </div>
    </main>
  );
}
