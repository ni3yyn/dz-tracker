import React from 'react';
import styles from './home.module.css';

type LegalDocument = 'privacy' | 'terms';

type Props = {
  isAuthenticated?: boolean;
  homeHref?: string;
  currentDocument?: LegalDocument;
};

export default function SiteFooter({
  isAuthenticated = false,
  homeHref = '',
  currentDocument,
}: Props) {
  const sectionHref = (id: string) => `${homeHref}#${id}`;

  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <div className={styles.footerIdentity}>
          <a href="/" className={styles.footerBrand} aria-label="تاجر تراك - الصفحة الرئيسية">
            <span className={styles.footerAnimatedMark} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tajertrack-animated.svg" alt="" width={42} height={42} decoding="async" />
            </span>
            <span className={styles.footerWordmark}><strong>تاجر تراك</strong><small>TAJERTRACK</small></span>
          </a>
          <p>منصة تربط طلبات متجرك بتجربة تتبّع واضحة، وتجمع تحديثات الشحن في مكان واحد.</p>
          <span className={styles.footerSignature}><i aria-hidden="true" /> ربط الطلبات · تتبّع الشحنات · متابعة الزبائن</span>
        </div>
        <nav className={styles.footerNav} aria-label="روابط المنصة">
          <h2>المنصة</h2>
          <a href={sectionHref('how-it-works')}>كيف يعمل</a>
          <a href={sectionHref('features')}>المزايا</a>
          <a href={sectionHref('pricing')}>الخطط والأسعار</a>
          <a href={sectionHref('faq')}>الأسئلة الشائعة</a>
        </nav>
        <nav className={styles.footerNav} aria-label="روابط حساب التاجر">
          <h2>حساب التاجر</h2>
          <a href={isAuthenticated ? '/merchant' : '/login'}>{isAuthenticated ? 'لوحة التاجر' : 'تسجيل الدخول'}</a>
          <a href="/register">إنشاء حساب</a>
        </nav>
        <nav className={styles.footerNav} aria-label="الوثائق القانونية">
          <h2>الوثائق القانونية</h2>
          <a href="/privacy" aria-current={currentDocument === 'privacy' ? 'page' : undefined}>سياسة الخصوصية</a>
          <a href="/terms" aria-current={currentDocument === 'terms' ? 'page' : undefined}>شروط الاستخدام</a>
        </nav>
        <div className={styles.footerStart}>
          <span className={styles.footerOverline}>جاهز للانطلاق؟</span>
          <p>ابدأ بربط متجرك، ودع زبائنك يتابعون طلباتهم بسهولة.</p>
          <a href="/register" className={styles.footerStartButton}>ابدأ الآن <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div className={styles.footerBottom}>
        <span className={styles.footerCopyright}>© {new Date().getFullYear()} تاجر تراك. جميع الحقوق محفوظة.</span>
        <span className={styles.footerBottomNote}>من الطلب إلى التوصيل، في مسار أوضح.</span>
        <a className={styles.footerTopLink} href={sectionHref('top')} aria-label="العودة إلى أعلى الصفحة">العودة للأعلى <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  );
}
