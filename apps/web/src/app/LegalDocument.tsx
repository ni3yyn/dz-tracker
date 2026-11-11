import React, { type ReactNode } from 'react';
import SiteHeader from './SiteHeader';
import styles from './legal.module.css';
import { LEGAL_EFFECTIVE_DATE, LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '../lib/legal';

type LegalSection = { title: string; body: ReactNode };

type Props = {
  title: string;
  intro: string;
  version: string;
  sections: LegalSection[];
  showOperatorDetails?: boolean;
};

export default function LegalDocument({
  title,
  intro,
  version,
  sections,
  showOperatorDetails = false,
}: Props) {
  const operatorName = process.env.LEGAL_OPERATOR_NAME?.trim() || 'تاجر تراك';
  const operatorAddress = process.env.LEGAL_OPERATOR_ADDRESS?.trim();
  const contactEmail = process.env.LEGAL_CONTACT_EMAIL?.trim();
  const dpoEmail = process.env.LEGAL_DPO_EMAIL?.trim();

  return (
    <main className={styles.legalPage}>
      <div className={styles.siteHeader}><SiteHeader compact /></div>
      <div className={styles.legalWrap}>
        <a className={styles.backLink} href="/">العودة إلى الصفحة الرئيسية <span aria-hidden="true">↗</span></a>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>تاجر تراك · الوثائق القانونية</span>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <div className={styles.meta}>
            <span>تاريخ السريان: {LEGAL_EFFECTIVE_DATE}</span>
            <span>الإصدار: {version}</span>
          </div>
        </header>

        <article className={styles.article}>
          {showOperatorDetails && (
            <section className={styles.operatorDetails}>
              <h2>الجهة المشغّلة والتواصل</h2>
              <p><strong>الاسم التجاري:</strong> {operatorName}</p>
              <p><strong>العنوان:</strong> {operatorAddress || 'الجزائر'}</p>
              {contactEmail ? (
                <p><strong>طلبات الخصوصية والدعم:</strong> <a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
              ) : (
                <p className={styles.contactSetupNotice}>
                  لم يُنشر بريد التواصل القانوني بعد. يجب ضبط LEGAL_CONTACT_EMAIL قبل فتح التسجيل للعامة.
                </p>
              )}
              {dpoEmail && <p><strong>مسؤول حماية البيانات:</strong> <a href={`mailto:${dpoEmail}`}>{dpoEmail}</a></p>}
            </section>
          )}
          {sections.map((section, index) => (
            <section className={styles.section} key={`${index}-${section.title}`}>
              <h2>{section.title}</h2>
              <div className={styles.sectionBody}>{section.body}</div>
            </section>
          ))}
        </article>

        <footer className={styles.footer}>
          <span>© {new Date().getFullYear()} {operatorName}</span>
          <nav aria-label="الوثائق القانونية">
            <a href="/privacy" aria-current={version === LEGAL_PRIVACY_VERSION ? 'page' : undefined}>سياسة الخصوصية</a>
            <a href="/terms" aria-current={version === LEGAL_TERMS_VERSION ? 'page' : undefined}>شروط الاستخدام</a>
          </nav>
        </footer>
      </div>
    </main>
  );
}
