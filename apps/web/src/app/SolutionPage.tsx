import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import styles from './solution.module.css';

export type SolutionSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type SolutionFaq = {
  question: string;
  answer: string;
};

type RelatedLink = {
  href: string;
  label: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
};

type Props = {
  language: 'ar' | 'fr';
  direction: 'rtl' | 'ltr';
  eyebrow: string;
  title: string;
  intro: string;
  sections: SolutionSection[];
  faqs: SolutionFaq[];
  relatedLinks: RelatedLink[];
};

export default function SolutionPage({
  language,
  direction,
  eyebrow,
  title,
  intro,
  sections,
  faqs,
  relatedLinks,
}: Props) {
  return (
    <main className={styles.page} lang={language} dir={direction}>
      <div className={styles.siteHeader} lang="ar" dir="rtl">
        <SiteHeader compact />
      </div>

      <div className={styles.content}>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
        </header>

        <article className={styles.article}>
          {sections.map((section) => (
            <section className={styles.section} id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}

          <section className={styles.faq} id="faq" aria-labelledby="faq-title">
            <h2 id="faq-title">{language === 'fr' ? 'Questions fréquentes' : 'أسئلة شائعة'}</h2>
            {faqs.map((faq) => (
              <div className={styles.faqItem} key={faq.question}>
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </div>
            ))}
          </section>

          <nav className={styles.related} aria-label={language === 'fr' ? 'Pages associées' : 'صفحات ذات صلة'}>
            <h2>{language === 'fr' ? 'Pour aller plus loin' : 'اكتشف المزيد'}</h2>
            {relatedLinks.map((link) => (
              <a href={link.href} key={link.href} lang={link.lang} dir={link.dir}>
                {link.label} <span aria-hidden="true">↗</span>
              </a>
            ))}
          </nav>

          <div className={styles.cta}>
            <p>{language === 'fr'
              ? 'Découvrez comment TajerTrack peut simplifier le suivi de vos commandes.'
              : 'ابدأ تنظيم تتبّع طلبات متجرك من لوحة واحدة.'}</p>
            <a href="/register">
              {language === 'fr' ? 'Créer un compte commerçant' : 'ابدأ ربط متجرك'}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
      </div>

      <div className={styles.footer} lang="ar" dir="rtl">
        <SiteFooter homeHref="/" />
      </div>
    </main>
  );
}
