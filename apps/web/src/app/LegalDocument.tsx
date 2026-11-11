import React, { type ReactNode } from 'react';
import SiteHeader from './SiteHeader';
import styles from './legal.module.css';
import SiteFooter from './SiteFooter';

type LegalSection = { title: string; body: ReactNode };

type Props = {
  title: string;
  intro: string;
  currentDocument: 'privacy' | 'terms';
  sections: LegalSection[];
  showOperatorDetails?: boolean;
};

export default function LegalDocument({
  title,
  intro,
  currentDocument,
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
        <header className={styles.hero}>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
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

      </div>
      <SiteFooter homeHref="/" currentDocument={currentDocument} />
    </main>
  );
}
