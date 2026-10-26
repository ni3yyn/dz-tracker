import React from 'react';
import styles from './home.module.css';
import ScrollRevealObserver from './ScrollRevealObserver';
import SiteHeader from './SiteHeader';
import FaqAccordion from './FaqAccordion';
import { createClient } from '../lib/supabase-server';

const steps = [
  {
    number: '01',
    title: 'أنشئ حساب التاجر',
    description: 'سجّل متجرك للوصول إلى إعدادات الربط ورابط Webhook الخاص بمساحتك.',
  },
  {
    number: '02',
    title: 'اربط متجرك أو شركة التوصيل',
    description: 'أضف SDK إلى موقعك، أو انسخ رابط Webhook إلى إعدادات Shopify أو شركة توصيل مدعومة.',
  },
  {
    number: '03',
    title: 'أرسل رابط التتبّع واترك الحالة تتحدّث',
    description: 'يصل رابط التتبّع إلى العميل عبر Telegram. حدّث الحالة من لوحة التاجر، أو استقبل التحديثات من شركة توصيل متصلة.',
  },
];

const features = [
  {
    number: '01',
    label: 'ربط المتجر',
    title: 'تكامل يناسب طريقة عملك',
    description: 'أضف SDK إلى موقعك، أو خذ رابط Webhook من تاجر تراك وأضفه إلى Shopify أو شركة توصيل مدعومة. اختر المسار المناسب لبنية متجرك.',
    symbol: 'integration',
  },
  {
    number: '02',
    label: 'رابط العميل',
    title: 'رابط التتبّع يصل عبر Telegram',
    description: 'عند وصول الطلب عبر التكامل، يُرسل للعميل رابط مباشر لصفحة التتبّع عبر Telegram، ليعود إلى آخر حالة متاحة دون السؤال عن كل تحديث.',
    symbol: 'telegram',
  },
  {
    number: '03',
    label: 'شبكة التوصيل',
    title: 'منظومة تضم أكثر من 80 شركة توصيل جزائرية',
    description: 'تتوفر تكاملات مع أكثر من 80 شركة توصيل جزائرية، منها Yalidine وZR Express. تظهر حالة الشحنة وفق الأحداث التي توفرها الشركة المتصلة.',
    symbol: 'network',
  },
  {
    number: '04',
    label: 'تحديث الحالات',
    title: 'تحديث يدوي أو مزامنة تلقائية',
    description: 'غيّر الحالة من لوحة التاجر متى احتجت، أو دع شركة التوصيل المتصلة تحدّثها تلقائياً عند وصول أحداث جديدة.',
    symbol: 'sync',
  },
];

const faqs = [
  {
    question: 'كيف أربط متجري بـ تاجر تراك؟',
    answer: 'يمكنك إضافة SDK إلى موقعك، أو إعداد Webhook وربطه بـ Shopify أو شركة توصيل مدعومة. يعتمد الخيار الأنسب على طريقة استقبال طلباتك.',
  },
  {
    question: 'كيف يصل رابط التتبّع إلى العميل؟',
    answer: 'يرسل تاجر تراك رابط التتبّع عبر Telegram عند تسجيل الطلب. دعم WhatsApp مخطط له لاحقاً، لكنه ليس قناة متاحة حالياً.',
  },
  {
    question: 'من يحدّث حالة الشحنة؟',
    answer: 'يمكن للتاجر تحديثها يدوياً من لوحة التحكم. وعند ربط شركة توصيل مدعومة وإعداد التكامل، يمكن للحالات أن تتزامن تلقائياً وفق الأحداث التي ترسلها الشركة.',
  },
  {
    question: 'هل يستبدل تاجر تراك شركة التوصيل؟',
    answer: 'لا. تاجر تراك يربط بيانات الطلب وتجربة التتبّع؛ وتظل عملية نقل الطرد لدى شركة التوصيل نفسها.',
  },
];

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span className={`${styles.brandMark} ${light ? styles.brandMarkLight : ''}`} aria-hidden="true">
      <svg viewBox="0 0 36 36" fill="none">
        <path d="M5.5 9.5H23c10 0 10 13 0 13H13c-9 0-9 10 0 10h16" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5.5" cy="9.5" r="2.1" fill="#D57955" />
        <circle cx="29" cy="32.5" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

function TrackingPreview() {
  return (
    <div className={styles.previewScene} aria-label="معاينة توضيحية لصفحة تتبّع الطلب" data-dz-reveal data-dz-reveal-delay="100">
      <div className={styles.sceneOrbOne} aria-hidden="true" />
      <div className={styles.sceneOrbTwo} aria-hidden="true" />
      <div className={styles.routeLabel}><span className={styles.routeLabelDot} /> معاينة توضيحية <span>١ / ٠١</span></div>
      <div className={styles.routeSvg} aria-hidden="true">
        <svg viewBox="0 0 430 500" preserveAspectRatio="none" fill="none">
          <path d="M18 72 C160 72 104 150 233 150 S370 223 270 275 S116 356 240 428" stroke="rgba(44,79,57,.22)" strokeWidth="1.4" strokeDasharray="3 8" />
          <circle cx="18" cy="72" r="5" fill="#2e503c" />
          <circle cx="233" cy="150" r="4" fill="#b5c0ae" />
          <circle cx="270" cy="275" r="5" fill="#d47855" />
          <circle cx="240" cy="428" r="4" fill="#b5c0ae" />
        </svg>
      </div>
      <div className={styles.previewCard}>
        <div className={styles.previewTopline}>
          <div className={styles.previewStore}>
            <span className={styles.previewStoreMark} aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M4 8h16c9 0 9 11 0 11h-9c-8 0-8 9 0 9h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="4" cy="8" r="2" fill="#D57955"/><circle cx="24" cy="28" r="2" fill="currentColor"/></svg></span>
            <span><b>متجر النخبة</b><small>تجربة تتبّع مخصصة</small></span>
          </div>
          <span className={styles.previewOrder}>طلب <b dir="ltr">DZ–1042</b></span>
        </div>
        <div className={styles.previewGreeting}>
          <span className={styles.previewKicker}>مرحباً بك</span>
          <h3>طلبك في الطريق إليك.</h3>
          <p>آخر حالة مسجّلة وتاريخ رحلة الشحنة، في مكان واحد.</p>
        </div>
        <div className={styles.previewCurrent}>
          <div className={styles.previewCurrentHead}><span>الحالة الحالية</span><span className={styles.previewCurrentLive}><i /> آخر تحديث</span></div>
          <div className={styles.previewCurrentBody}>
            <span className={styles.previewCurrentIcon}><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 8h11c7 0 7 8 0 8H9c-6 0-6 8 0 8h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="3" cy="8" r="2.1" fill="#D57955"/><circle cx="24" cy="24" r="2.1" fill="currentColor"/><path d="M21 7h7M25 3v8" stroke="#D57955" strokeWidth="1.4" strokeLinecap="round"/></svg></span>
            <span><b>خرج للتوصيل</b><small>الشحنة في طريقها إلى عنوانك</small></span>
            <span className={styles.previewNow}>الآن</span>
          </div>
        </div>
        <div className={styles.previewHistoryHead}><b>رحلة الشحنة</b><span>سجل التحديثات</span></div>
        <div className={styles.previewHistory}>
          <div className={`${styles.previewEvent} ${styles.previewEventActive}`}><span className={styles.previewDot} /><span><b>خرج للتوصيل مع المندوب</b><small>آخر تحديث مسجّل</small></span></div>
          <div className={styles.previewEvent}><span className={styles.previewDot} /><span><b>وصل إلى مركز التوزيع</b><small>تم تسجيل الوصول</small></span></div>
          <div className={styles.previewEvent}><span className={styles.previewDot} /><span><b>تم تجهيز الطلب</b><small>بداية رحلة الشحنة</small></span></div>
        </div>
        <div className={styles.previewBottom}><span className={styles.previewBottomMark} /> مثال توضيحي لصفحة العميل</div>
      </div>
      <div className={styles.sceneAnnotation}><span>وضوح في كل خطوة</span><span className={styles.annotationRule} /><span>رحلة الطلب</span></div>
    </div>
  );
}

function FeatureSymbol({ type }: { type: string }) {
  if (type === 'integration') return (
    <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M7 18h14c10 0 10 13 0 13h-2c-9 0-9 13 0 13h15c8 0 8 12 0 12h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M38 15h12m-6-6v12M44 44h17m-8-8v16" stroke="#D57955" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="18" r="3" fill="#D57955" /><circle cx="30" cy="59" r="3" fill="currentColor" />
      <circle cx="50" cy="15" r="2.5" fill="currentColor" /><circle cx="61" cy="44" r="2.5" fill="#D57955" />
    </svg>
  );
  if (type === 'telegram') return (
    <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M8 56C20 56 20 44 32 44h8" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 5" strokeLinecap="round" />
      <circle cx="8" cy="56" r="3" fill="#D57955" />
      <path d="m27 22 37-13-12 42-11-14-10 7 2-15Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m31 29 21-13-11 21" stroke="#D57955" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="52" cy="51" r="3" fill="#D57955" />
    </svg>
  );
  if (type === 'network') return (
    <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M13 17 34 32 57 14M34 32 18 54M34 32 57 55M18 54 57 55" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="17" r="4" fill="#D57955" /><circle cx="34" cy="32" r="5" fill="#f4f3ed" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="57" cy="14" r="4" fill="currentColor" /><circle cx="18" cy="54" r="4" fill="currentColor" /><circle cx="57" cy="55" r="4" fill="#D57955" />
      <path d="M9 31h12M49 34h14" stroke="#D57955" strokeWidth="1.2" strokeDasharray="2 4" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M54 27a20 20 0 0 0-35-8l-5 6M18 11l-4 14 14-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 45a20 20 0 0 0 35 8l5-6M54 61l4-14-14 1" stroke="#D57955" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m28 35 6 6 12-14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="36" r="29" stroke="currentColor" strokeOpacity=".12" strokeDasharray="2 6" />
    </svg>
  );
}

export default async function HomePage() {
  let isAuthenticated = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  } catch {
    isAuthenticated = false;
  }
  return (
    <main className={styles.page}>
      <ScrollRevealObserver />
      <SiteHeader isAuthenticated={isAuthenticated} />

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy} data-dz-reveal>
          <div className={styles.eyebrow}><span className={styles.eyebrowIcon} aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M2 5.5h6.5c4.5 0 4.5 6 0 6H6c-4 0-4 5.5 0 5.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="2" cy="5.5" r="1.4" fill="#D57955"/><circle cx="17" cy="17" r="1.4" fill="currentColor"/></svg></span> تكاملات الشحن وتجربة التتبّع</div>
          <h1 id="hero-title">قلّل رسائل<br /><em>«وين راه طلبي؟»</em></h1>
          <p className={styles.heroDescription}>عندما تكبر الطلبات، تتكرر أسئلة العملاء عن حالة الشحن. تاجر تراك يرسل لكل عميل رابط تتبّع يحمل هوية متجرك، ويعرض آخر حالة للطلب — بتحديث يدوي أو تلقائي من شركة توصيل مربوطة.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href={isAuthenticated ? "/merchant" : "/register"}>{isAuthenticated ? "افتح لوحة التاجر" : "اربط متجرك الآن"} <span aria-hidden="true">↗</span></a>
            <a className={styles.secondaryButton} href="#how-it-works">شاهد طريقة الربط <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroProof}>
            <span className={styles.heroProofMark}><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <span>SDK أو Webhook</span><i /> <span>رابط عبر Telegram</span><i /> <span>+80 شركة توصيل جزائرية</span>
          </div>
        </div>
        <TrackingPreview />
        <div className={styles.heroIndex}><span>01</span><span className={styles.heroIndexLine} /><span>طلبات أقلّ إزعاجاً</span></div>
      </section>

      <section className={styles.valueBand} aria-label="مبادئ التجربة" data-dz-reveal>
        <p>ربط عبر SDK أو Webhook.</p><span className={styles.valueGlyph} aria-hidden="true"><svg viewBox="0 0 26 18" fill="none"><path d="M1 4.5h8c5 0 5 7 0 7H6c-4 0-4 5 0 5h18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="1" cy="4.5" r="1.3" fill="#D57955"/><circle cx="24" cy="16.5" r="1.3" fill="currentColor"/></svg></span><p>رابط مباشر عبر Telegram.</p><span className={styles.valueGlyph} aria-hidden="true"><svg viewBox="0 0 26 18" fill="none"><path d="M1 4.5h8c5 0 5 7 0 7H6c-4 0-4 5 0 5h18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="1" cy="4.5" r="1.3" fill="#D57955"/><circle cx="24" cy="16.5" r="1.3" fill="currentColor"/></svg></span><p>تحديث يدوي أو تلقائي.</p>
      </section>

      <section className={styles.routeRibbon} aria-label="تدفق الطلب والتتبّع" data-dz-reveal>
        <div className={styles.routeRibbonHead}>
          <span className={styles.routeRibbonEyebrow}>من تسجيل الطلب إلى التتبّع</span>
          <p>العميل يفتح رابط التتبّع بدل ما يراسلك ليسأل عن الطلب.</p>
        </div>
        <div className={styles.routeRibbonMap} aria-hidden="true">
          <svg viewBox="0 0 1000 96" fill="none" preserveAspectRatio="xMidYMid meet" direction="ltr">
            <path d="M125 70 C220 70 250 35 375 35 S510 103 625 68 S760 29 875 45" stroke="#a9b8a4" strokeWidth="1.5" strokeDasharray="4 8" strokeLinecap="round" />
            <path d="M125 70 C220 70 250 35 375 35" stroke="#2e503c" strokeWidth="2" strokeLinecap="round" />
            <circle cx="125" cy="70" r="7" fill="#f7f6f0" stroke="#2e503c" strokeWidth="2" />
            <circle cx="375" cy="35" r="7" fill="#d57955" />
            <circle cx="625" cy="68" r="7" fill="#f7f6f0" stroke="#7c9278" strokeWidth="2" />
            <circle cx="875" cy="45" r="8" fill="#2e503c" />
            <path d="m871 45 2.5 2.5 5-5" stroke="#f7f6f0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <g transform="translate(375 4)" stroke="#2e503c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M-13 4h26v15h-26z"/><path d="M-16 4l3-8h20l6 8M-7 19v-9h8v9"/></g>
            <g transform="translate(625 40)" stroke="#2e503c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M-14 -2 14 -12 5 14 -1 3 -7 7 -5 0Z"/><path d="m-1 3 6-5"/></g>
          </svg>
        </div>
        <div className={styles.routeRibbonStops}>
          <div><span>01</span><strong>متجرك</strong><small>يصل طلب جديد</small></div>
          <div><span>02</span><strong>تكامل تاجر تراك</strong><small>SDK أو Webhook</small></div>
          <div><span>03</span><strong>Telegram</strong><small>رابط التتبّع للعميل</small></div>
          <div><span>04</span><strong>حالة الشحنة</strong><small>يدوي أو تلقائي</small></div>
        </div>
      </section>

      <section className={styles.howSection} id="how-it-works" aria-labelledby="how-title" data-dz-reveal>
        <div className={styles.sectionIntro}>
          <span className={styles.sectionEyebrow}>كيف يعمل؟</span>
          <h2 id="how-title">اربط الطلبات.<br /><em>خفّف أسئلة المتابعة.</em></h2>
          <p>استقبل الطلبات من موقعك أو Shopify، وأرسل رابط التتبّع للعميل. حدّث الحالة بنفسك أو اربط شركة توصيل تدعم إرسال التحديثات.</p>
        </div>
        <div className={styles.stepsList}>
          {steps.map((step) => (
            <article className={styles.step} key={step.number} data-dz-reveal data-dz-reveal-delay={Number(step.number) * 70}>
              <span className={styles.stepNumber}>{step.number}</span>
              <div className={styles.stepCopy}><h3>{step.title}</h3><p>{step.description}</p></div>
              <span className={styles.stepArrow} aria-hidden="true">↙</span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.featuresSection} id="features" aria-labelledby="features-title" data-dz-reveal>
        <div className={styles.featuresHead}>
          <div><span className={styles.sectionEyebrow}>من الربط إلى التحديث</span><h2 id="features-title">رابط تتبّع باسم متجرك.<br /><em>وتحديثات في مكان واحد.</em></h2></div>
          <p>العميل يعرف آخر حالة متاحة من صفحة تحمل هوية متجرك، وأنت تقلّل الرسائل المتكررة عن مكان الطلب.</p>
        </div>
        <div className={styles.featuresList}>
          {features.map((feature, index) => (
            <React.Fragment key={feature.number}>
              <article className={styles.featureRow} data-dz-reveal data-dz-reveal-delay={index * 90}>
                <div className={styles.featureRowMeta}>
                  <span className={styles.featureRowNumber}>{feature.number}</span>
                  <span className={styles.featureRowLabel}>{feature.label}</span>
                </div>
                <div className={styles.featureRowCopy}>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
                <div className={styles.featureRowArt} aria-hidden="true"><FeatureSymbol type={feature.symbol} /></div>
                <span className={styles.featureRowArrow} aria-hidden="true">↙</span>
              </article>
              {index < features.length - 1 && (
                <svg className={styles.curveDivider} viewBox="0 0 1200 34" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <path d={index === 0 ? 'M0 18 C205 18 195 5 415 13 S800 29 1200 12' : 'M0 12 C230 28 395 6 610 17 S990 8 1200 18'} stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
                  <circle cx={index === 0 ? '415' : '610'} cy={index === 0 ? '13' : '17'} r="3" fill="#D57955" />
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className={styles.splitSection} aria-labelledby="split-title" data-dz-reveal>
        <div className={styles.splitArt} aria-hidden="true" data-dz-reveal data-dz-reveal-delay="80">
          <div className={styles.splitArtCircle} /><div className={styles.splitArtCircleInner} />
          <svg viewBox="0 0 440 330" fill="none"><path d="M20 258C102 258 94 185 179 185S266 112 337 112H421" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 8"/><circle cx="20" cy="258" r="5" fill="currentColor"/><circle cx="179" cy="185" r="5" fill="currentColor"/><circle cx="337" cy="112" r="5" fill="#d47855"/></svg>
          <div className={styles.artNote}><span>شبكة التوصيل</span><b><i>+80</i>شركة توصيل<br />جزائرية مدمجة</b></div>
        </div>
        <div className={styles.splitCopy} data-dz-reveal>
          <span className={styles.sectionEyebrow}>منظومة التوصيل الجزائرية</span>
          <h2 id="split-title">حالة الطلب واضحة<br /><em>بدل عشرات الرسائل.</em></h2>
          <p>اعرض للعميل صفحة تتبّع تحمل هوية متجرك. إذا ربطت شركة توصيل مدعومة، تظهر التحديثات التي ترسلها؛ وإلا يمكنك تغيير الحالة من لوحة التاجر.</p>
          <div className={styles.carrierNames} aria-label="أمثلة على شركات توصيل مدعومة"><span>Yalidine</span><i /><span>ZR Express</span><i /><span>وشركات أخرى مدمجة</span></div>
          <a className={styles.textLink} href="/register">ابدأ إعداد التكامل <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing" aria-labelledby="pricing-title" data-dz-reveal>
        <div className={styles.pricingHead}>
          <span className={styles.sectionEyebrow}>تسعير حسب عدد الطلبات</span>
          <h2 id="pricing-title">ابدأ مجاناً.<br /><em>ادفع حسب حجم متجرك.</em></h2>
          <p>اختر الخطة حسب عدد الطلبات التي تستقبلها كل شهر.</p>
        </div>
        <div className={styles.pricingList}>
          <article className={styles.priceRow}>
            <div><span className={styles.priceOrders}>أقل من 30 طلباً / شهر</span><h3>مجاني</h3></div>
            <div className={styles.priceAmount}><strong>0</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>ابدأ مجاناً <span aria-hidden="true">↗</span></a>
          </article>
          <article className={styles.priceRow}>
            <div><span className={styles.priceOrders}>حتى 100 طلب / شهر</span><h3>للمتاجر الصغيرة</h3></div>
            <div className={styles.priceAmount}><strong>1,000</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>اختر الخطة <span aria-hidden="true">↗</span></a>
          </article>
          <article className={styles.priceRow}>
            <div><span className={styles.priceOrders}>حتى 200 طلب / شهر</span><h3>للمتاجر النامية</h3></div>
            <div className={styles.priceAmount}><strong>1,800</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>اختر الخطة <span aria-hidden="true">↗</span></a>
          </article>
          <article className={`${styles.priceRow} ${styles.priceRowUnlimited}`}>
            <div><span className={styles.priceOrders}>دون حدّ للطلبات</span><h3>للحجم الكبير</h3></div>
            <div className={styles.priceAmount}><strong>2,500</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>اختر الخطة <span aria-hidden="true">↗</span></a>
          </article>
        </div>
        <p className={styles.pricingNote}>تُحتسب الخطة حسب عدد الطلبات الشهري. تفاصيل الحدود الدقيقة تظهر قبل الاشتراك.</p>
      </section>

      <section className={styles.faqSection} id="faq" aria-labelledby="faq-title" data-dz-reveal>
        <div className={styles.faqIntro}><span className={styles.sectionEyebrow}>قبل أن تبدأ</span><h2 id="faq-title">التكاملات والتتبّع،<br /><em>بلا أسئلة معلّقة.</em></h2></div>
        <FaqAccordion faqs={faqs} />
      </section>

      <section className={styles.finalCta} data-dz-reveal>
        <span className={styles.finalCtaEyebrow}>ابدأ من هنا</span>
        <h2>اربط متجرك.<br /><em>ودع العميل يتابع بنفسه.</em></h2>
        <p>ابدأ بحساب تاجر، ثم اختر التكامل المناسب لاستقبال الطلبات وتحديث حالاتها.</p>
        <a className={styles.finalCtaButton} href="/register">ابدأ ربط متجرك <span aria-hidden="true">↗</span></a>
        <svg className={styles.ctaRouteArt} viewBox="0 0 240 180" fill="none" aria-hidden="true"><path d="M5 22h65c45 0 45 48 0 48H42c-38 0-38 45 0 45h64c39 0 39 43 77 43h52" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 7" strokeLinecap="round"/><circle cx="5" cy="22" r="4" fill="#D57955"/><circle cx="70" cy="70" r="4" fill="currentColor"/><circle cx="106" cy="115" r="4" fill="#D57955"/><circle cx="235" cy="158" r="4" fill="currentColor"/></svg>
      </section>

      <footer className={styles.footer}>
        <a href="/" className={styles.footerBrand}><BrandMark light /> <strong>تاجر تراك TajerTrack</strong></a>
        <span>منصة متابعة الطلبات وتجربة ما بعد الشراء</span>
        <div className={styles.footerLinks}><a href="#how-it-works">كيف يعمل</a><a href="/login">تسجيل الدخول</a><a href="/register">إنشاء حساب</a></div>
        <a href="#pricing" className={styles.footerPricing}>الأسعار</a><span className={styles.footerCopyright}>© تاجر تراك TajerTrack</span>
      </footer>
    </main>
  );
}
