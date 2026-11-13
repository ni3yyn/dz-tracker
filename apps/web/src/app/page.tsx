import React from 'react';
import styles from './home.module.css';
import ScrollRevealObserver from './ScrollRevealObserver';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import FaqAccordion from './FaqAccordion';
import CustomPlanRequest from './CustomPlanRequest';
import { createClient } from '../lib/supabase-server';

export const metadata = {
  title: 'نظام تتبّع طلبات المتاجر',
  description: 'أرسل روابط تتبّع الطلبات عبر SMS، وتابع الشحنات، وقدّم لزبائنك تجربة أسهل للاستبدال وخدمات ما بعد البيع.',
};

const steps = [
  {
    number: '01',
    title: 'أنشئ حسابك',
    description: 'أنشئ حساب التاجر وافتح لوحة التحكم لتبدأ إعداد مساحة متجرك.',
  },
  {
    number: '02',
    title: 'اربط متجرك',
    description: 'اربط متجرك عبر SDK أو Webhook، ثم صِل شركة توصيل متوافقة إذا أردت مزامنة حالات الشحن تلقائياً.',
  },
  {
    number: '03',
    title: 'خصّص صفحة التتبّع',
    description: 'أضف هوية متجرك من الشعار والألوان واسم العلامة، ليشاهد الزبون تجربة تتبّع تشبه متجرك.',
  },
  {
    number: '04',
    title: 'دع التتبّع يسير',
    description: 'يرسل تاجر تراك رابط التتبّع للزبون عبر SMS، مع إمكانية استخدام Telegram كقناة إضافية. ويمكن للزبون متابعة تحديثات الشحنة، ثم طلب الاستبدال من صفحة التتبّع نفسها.',
  },
  {
    number: '05',
    title: 'تابع ما بعد التسليم',
    description: 'بعد استلام الطلب، يستطيع الزبون إرسال طلب استبدال من صفحة التتبّع ومتابعة قرار المتجر وشحنة المنتج البديل من الرابط نفسه. وإرشادات الاستخدام والعناية بالمنتج قادمة لتكتمل التجربة.',
  },
];

const features = [
  {
    number: '01',
    label: 'ربط المتجر',
    title: 'ربط يناسب طريقة عملك',
    description: 'أضف SDK إلى موقعك، أو خذ رابط Webhook من تاجر تراك وأضفه إلى Shopify أو شركة توصيل مدعومة. اختر المسار المناسب لبنية متجرك.',
    symbol: 'integration',
  },
  {
    number: '02',
    label: 'هوية متجرك',
    title: 'صفحة تتبّع تحمل علامتك التجارية',
    description: 'خصّص صفحة الزبون بشعار متجرك وألوانه واسمه، لتبدو امتداداً لتجربة الشراء لديك، لا صفحة موحّدة تشبه كل المتاجر الأخرى.',
    symbol: 'branding',
  },
  {
    number: '03',
    label: 'رسائل SMS',
    title: 'رابط التتبّع يصل عبر SMS',
    description: 'يرسل تاجر تراك رابط التتبّع إلى الزبون برسالة SMS. تفاصيل خيارات الإرسال متاحة داخل لوحة التحكم.',
    symbol: 'sms',
  },
  {
    number: '04',
    label: 'قناة إضافية',
    title: 'Telegram كخيار إضافي',
    description: 'يمكنك تفعيل Telegram كقناة إضافية لإرسال رابط التتبّع.',
    symbol: 'telegram',
  },
  {
    number: '05',
    label: 'تنبيهات المتصفح',
    title: 'إشعار عند كل تغيير في حالة الشحنة',
    description: 'من صفحة التتبّع، يفعّل الزبون إشعارات المتصفح بإذنه. بعدها تصله تنبيهات عند كل تحديث جديد لحالة شحنته، حتى إذا أغلق الصفحة، ما دام المتصفح والجهاز يسمحان بالإشعارات.',
    symbol: 'browserNotifications',
  },
  {
    number: '06',
    label: 'شبكة التوصيل',
    title: 'منظومة تضم أكثر من 80 شركة توصيل جزائرية',
    description: 'تتوفر ربطات مع أكثر من 80 شركة توصيل جزائرية، منها Yalidine وZR Express. تظهر حالة الشحنة وفق الأحداث التي توفرها الشركة المتصلة.',
    symbol: 'network',
  },
  {
    number: '07',
    label: 'متابعة الزبون',
    title: 'تذكير بالطلبات التي تحتاج تدخّلك',
    description: 'إذا لم يردّ الزبون على مندوب التوصيل، ينبهك تاجر تراك لتتواصل معه مباشرة عبر زر WhatsApp سريع، وتتأكد إن كان التسليم سيؤجّل أم يُلغى.',
    symbol: 'whatsappReminder',
  },
  {
    number: '08',
    label: 'تحديث الحالات',
    title: 'تحديث يدوي أو مزامنة تلقائية',
    description: 'غيّر حالة الطلب من لوحة التاجر متى احتجت، أو دع شركة التوصيل المتصلة تحدّثها تلقائياً عند وصول أحداث جديدة.',
    symbol: 'sync',
  },
  {
    number: '09',
    label: 'خدمات ما بعد البيع',
    title: 'استبدال أسهل من صفحة التتبّع',
    description: 'بعد الاستلام، يرسل الزبون طلب الاستبدال ويحدد السبب والتفاصيل من صفحة الطلب. تراجع الطلب من لوحة التاجر، ثم تربط شحنة البديل ليتابعها الزبون من الرابط الأصلي.',
    symbol: 'exchange',
  },
  {
    number: '10',
    label: 'دليل المنتج · قريباً',
    title: 'إرشادات الاستخدام والعناية',
    description: 'نعمل على مساحة تتيح لك مشاركة إرشادات المنتج، ونصائح الاستخدام والعناية والمقاسات، حتى يعرف الزبون ما يحتاجه بعد الشراء.',
    symbol: 'productGuide',
  },
];

const faqs = [
  {
    question: 'كيف أربط متجري بـ تاجر تراك؟',
    answer: 'يمكنك إضافة SDK إلى موقعك، أو إعداد Webhook وربطه بـ Shopify أو شركة توصيل مدعومة. يعتمد الخيار الأنسب على طريقة استقبال طلباتك.',
  },
  {
    question: 'كيف يصل رابط التتبّع إلى الزبون؟',
    answer: 'يرسل تاجر تراك رابط التتبّع إلى الزبون عبر SMS. ويمكنك تفعيل Telegram كقناة إضافية، وتجد خيارات الإرسال وتفاصيلها داخل لوحة التحكم.',
  },
  {
    question: 'هل يتلقى الزبون إشعارات عند تغيّر حالة الطلب؟',
    answer: 'نعم. من صفحة التتبّع، يختار الزبون تفعيل إشعارات المتصفح ويمنح الإذن. بعدها تصله تنبيهات عند تسجيل تحديث جديد لحالة الشحنة، حتى عند إغلاق صفحة التتبّع، بحسب دعم المتصفح وإعدادات الجهاز.',
  },
  {
    question: 'كيف يطلب الزبون استبدال المنتج؟',
    answer: 'بعد استلام الطلب، وإذا فعّل المتجر الخدمة، يظهر للزبون خيار طلب الاستبدال في صفحة التتبّع. يختار السبب ويضيف التفاصيل، ثم يتابع قرار المتجر وشحنة المنتج البديل من الصفحة نفسها.',
  },
  {
    question: 'هل تتوفر إرشادات للمنتج؟',
    answer: 'إرشادات الاستخدام والعناية بالمنتج من خدمات ما بعد البيع التي نعمل على إضافتها قريباً.',
  },
  {
    question: 'من يحدّث حالة الشحنة؟',
    answer: 'يمكن للتاجر تحديثها يدوياً من لوحة التحكم. وعند ربط شركة توصيل مدعومة وإعداد الربط، يمكن للحالات أن تتزامن تلقائياً وفق الأحداث التي ترسلها الشركة.',
  },
  {
    question: 'هل يمكنني تخصيص صفحة التتبّع بهوية متجري؟',
    answer: 'نعم، يمكنك تهيئة صفحة التتبّع لتظهر باسم متجرك وشعاره وألوانه، حتى تبقى تجربة الزبون متناسقة مع علامتك التجارية.',
  },
  {
    question: 'ماذا يحدث إذا لم يردّ الزبون على مندوب التوصيل؟',
    answer: 'يظهر لك تذكير بالطلب الذي يحتاج متابعة، مع زر WhatsApp سريع للتواصل مع الزبون والتأكد من تأجيل التسليم أو إلغاء الطلب.',
  },
  {
    question: 'هل يستبدل تاجر تراك شركة التوصيل؟',
    answer: 'لا. تاجر تراك يربط بيانات الطلب وتجربة التتبّع؛ وتظل عملية نقل الطرد لدى شركة التوصيل نفسها.',
  },
];

function TrackingPreview() {
  return (
    <div className={styles.previewScene} aria-label="معاينة توضيحية لصفحة تتبّع الطلب" data-dz-reveal data-dz-reveal-delay="100">
      <div className={styles.sceneOrbOne} aria-hidden="true" />
      <div className={styles.sceneOrbTwo} aria-hidden="true" />
      <div className={styles.routeLabel}><span className={styles.routeLabelDot} /> معاينة توضيحية <span>١ / ٠١</span></div>
      <div className={styles.routeSvg} aria-hidden="true">
        <svg viewBox="0 0 430 500" preserveAspectRatio="none" fill="none">
          <path className={styles.routeTracePath} d="M18 72 C160 72 104 150 233 150 S370 223 270 275 S116 356 240 428" stroke="rgba(44,79,57,.28)" strokeWidth="1.5" strokeDasharray="3 8" />
          <circle className={styles.routeTraceNode} cx="18" cy="72" r="5" fill="#2e503c" />
          <circle className={styles.routeTraceNodeSoft} cx="233" cy="150" r="4" fill="#b5c0ae" />
          <circle className={styles.routeTraceNodeAccent} cx="270" cy="275" r="5" fill="#d47855" />
          <circle className={styles.routeTraceNodeSoft} cx="240" cy="428" r="4" fill="#b5c0ae" />
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
          <div className={styles.previewCurrentHead}><span>الحالة الحالية</span><span className={styles.previewCurrentLive}><i className={styles.livePulse} /> آخر تحديث</span></div>
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
        <div className={styles.previewBottom}><span className={styles.previewBottomMark} /> مثال توضيحي لصفحة الزبون</div>
      </div>
      <div className={styles.sceneAnnotation}><span>وضوح في كل خطوة</span><span className={styles.annotationRule} /><span>رحلة الطلب</span></div>
    </div>
  );
}

function FeatureSymbol({ type }: { type: string }) {
  if (type === 'integration') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlob} cx="88" cy="72" rx="72" ry="53" fill="#e6ece2" />
      <circle className={styles.illustrationOrbit} cx="89" cy="70" r="52" stroke="#b9c9b5" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.integrationStore}>
        <rect x="21" y="34" width="78" height="72" rx="8" fill="#fffefa" stroke="#cfdbca" />
        <path d="M21 46h78" stroke="#dbe3d6" />
        <circle cx="31" cy="40" r="2" fill="#d57955" /><circle cx="38" cy="40" r="2" fill="#d5ddcf" /><circle cx="45" cy="40" r="2" fill="#d5ddcf" />
        <path d="M35 58h50v6H35z" fill="#e9eee5" />
        <path d="M35 73h21v21H35z" fill="#dfe8da" />
        <path d="M62 75h22M62 82h18M62 89h13" stroke="#8a9e86" strokeWidth="2" strokeLinecap="round" />
        <path d="M43 73v-5c0-3 2-5 5-5s5 2 5 5v5" stroke="#55765b" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <path className={styles.illustrationFlow} d="M99 72h18c8 0 8-13 17-13h8" stroke="#7f9a7b" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="4 5" />
      <circle className={styles.integrationSignal} cx="111" cy="72" r="3.4" fill="#d57955" />
      <g className={styles.integrationWebhook}>
        <rect x="119" y="42" width="43" height="48" rx="7" fill="#294b37" />
        <path d="M130 55h20M130 61h14M130 67h17" stroke="#e9eee5" strokeWidth="1.5" strokeLinecap="round" />
        <path d="m135 77 4 4 8-9" stroke="#e9b29a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="151" cy="31" r="5" fill="#f0d9cb" /><circle className={styles.illustrationSpark} cx="151" cy="31" r="2.2" fill="#d57955" />
      <path d="M17 115h38" stroke="#a9b9a4" strokeWidth="1.2" strokeLinecap="round" /><circle cx="14" cy="115" r="2.5" fill="#d57955" />
    </svg>
  );
  if (type === 'branding') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlob} cx="90" cy="74" rx="72" ry="52" fill="#e6ece2" />
      <circle className={styles.illustrationOrbit} cx="90" cy="72" r="54" stroke="#b9c9b5" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.brandPageCard}>
        <rect x="27" y="19" width="96" height="99" rx="10" fill="#fffefa" stroke="#d2ddce" />
        <path d="M27 46h96" stroke="#e3e9df" />
        <circle cx="43" cy="33" r="7" fill="#294b37" />
        <path d="M39 33h8M43 29v8" stroke="#f7f6f0" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M56 30h41M56 36h28" stroke="#849681" strokeWidth="2" strokeLinecap="round" />
        <rect x="37" y="56" width="76" height="21" rx="5" fill="#e7eee3" />
        <path d="M45 64h31M45 70h21" stroke="#718b70" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M40 89h44" stroke="#b7c5b2" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 96h31" stroke="#d2dbce" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 105h56" stroke="#d2dbce" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className={styles.brandPalette}>
        <rect x="110" y="73" width="49" height="39" rx="7" fill="#fffefa" stroke="#d2ddce" />
        <circle cx="122" cy="85" r="5" fill="#294b37" />
        <circle cx="135" cy="85" r="5" fill="#d57955" />
        <circle cx="148" cy="85" r="5" fill="#b8c9ad" />
        <path d="M119 99h31" stroke="#a8b7a2" strokeWidth="2" strokeLinecap="round" />
        <path d="m137 59 4 4 8-10" stroke="#d57955" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className={styles.illustrationSpark} cx="147" cy="31" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'whatsappReminder') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlobWarm} cx="90" cy="73" rx="72" ry="52" fill="#f0e4d9" />
      <circle className={styles.illustrationOrbit} cx="89" cy="72" r="53" stroke="#d9c5b7" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.noReplyCard}>
        <rect x="18" y="30" width="94" height="77" rx="9" fill="#fffefa" stroke="#d8ded3" />
        <path d="M18 49h94" stroke="#e2e6dd" />
        <circle cx="31" cy="39" r="3" fill="#d57955" />
        <path d="M41 37h42" stroke="#8c9a89" strokeWidth="2" strokeLinecap="round" />
        <circle cx="37" cy="64" r="8" fill="#f1e0d5" />
        <path d="M34 62a3 3 0 0 1 6 0v2a3 3 0 0 1-6 0v-2ZM32 72c1-3 3-4 5-4s4 1 5 4" stroke="#b96d4c" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M51 61h43M51 68h30" stroke="#c3cec0" strokeWidth="2" strokeLinecap="round" />
        <rect x="29" y="82" width="72" height="15" rx="4" fill="#f4e6dc" />
        <circle cx="38" cy="89.5" r="3" fill="#d57955" />
        <path d="M46 89h43" stroke="#b97b5e" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <path className={styles.illustrationFlow} d="M112 66h9c7 0 7-12 15-12" stroke="#7d9879" strokeWidth="1.6" strokeDasharray="3 5" strokeLinecap="round" />
      <g className={styles.whatsappQuickAction}>
        <circle cx="143" cy="54" r="23" fill="#2b8a55" />
        <path d="M130 43a16 16 0 0 1 27 12 16 16 0 0 1-20 15l-7 2 2-7a16 16 0 0 1-2-22Z" stroke="#f7f6f0" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M137 48c1-2 2-1 3 1l2 3c.5 1-1 2-1.5 2.5 1.5 2 3 3 5 4 .5-1 1-2.5 2.3-1.8l3 1.7c1 .7 0 3-1.5 4-2 1.5-7-1-11-5s-5-8-1.3-11.4Z" fill="#f7f6f0" />
        <rect x="111" y="86" width="49" height="25" rx="6" fill="#fffefa" stroke="#d6dfd1" />
        <path d="M121 94h28M121 101h20" stroke="#6e8b70" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="154" cy="91" r="3" fill="#d57955" />
      </g>
      <circle className={styles.illustrationSpark} cx="37" cy="20" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'telegram') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlobWarm} cx="89" cy="73" rx="72" ry="53" fill="#f0e4d9" />
      <circle className={styles.illustrationOrbit} cx="91" cy="69" r="53" stroke="#d9c5b7" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.telegramMessage}>
        <rect x="22" y="30" width="100" height="77" rx="9" fill="#fffefa" stroke="#d8ded3" />
        <path d="M22 48h100" stroke="#e2e6dd" />
        <circle cx="34" cy="39" r="3" fill="#d57955" />
        <path d="M43 37h34" stroke="#8c9a89" strokeWidth="2" strokeLinecap="round" />
        <rect x="32" y="58" width="71" height="22" rx="5" fill="#e6eee3" />
        <path d="M40 65h37M40 72h25" stroke="#718b70" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M32 90h37" stroke="#cbd6c7" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 97h25" stroke="#cbd6c7" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path className={styles.illustrationFlow} d="M121 75c13 0 9-20 20-20" stroke="#7d9879" strokeWidth="1.6" strokeDasharray="3 5" strokeLinecap="round" />
      <g className={styles.telegramPlane}>
        <circle cx="144" cy="48" r="23" fill="#294b37" />
        <path d="m130 47 28-11-9 31-8-11-7 5 2-10Z" fill="#f7f6f0" stroke="#f7f6f0" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="m143 56 8-12-13 7" stroke="#d57955" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className={styles.telegramLinkTag}>
        <rect x="109" y="88" width="52" height="23" rx="5" fill="#f7f6f0" stroke="#d6dfd1" />
        <path d="M119 99h15m-4-4 4 4-4 4" stroke="#294b37" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="151" cy="99" r="2" fill="#d57955" />
      </g>
      <circle className={styles.illustrationSpark} cx="38" cy="20" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'browserNotifications') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlobWarm} cx="89" cy="73" rx="72" ry="53" fill="#f0e4d9" />
      <circle className={styles.illustrationOrbit} cx="91" cy="69" r="53" stroke="#d9c5b7" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.browserNotificationWindow}>
        <rect x="19" y="28" width="111" height="82" rx="8" fill="#fffefa" stroke="#d8ded3" />
        <path d="M19 47h111" stroke="#e2e6dd" />
        <circle cx="30" cy="37.5" r="2.3" fill="#d57955" />
        <circle cx="38" cy="37.5" r="2.3" fill="#cbd6c7" />
        <circle cx="46" cy="37.5" r="2.3" fill="#cbd6c7" />
        <rect x="30" y="57" width="31" height="34" rx="5" fill="#e6eee3" />
        <path d="m37 66 8-4 8 4v11l-8 5-8-5V66Z" fill="#fffefa" stroke="#718b70" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M69 62h43M69 69h31M69 83h37M69 90h24" stroke="#c1cdc0" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path className={styles.illustrationFlow} d="M112 65c12 0 8-15 18-15" stroke="#7d9879" strokeWidth="1.6" strokeDasharray="3 5" strokeLinecap="round" />
      <g className={styles.browserNotificationToast}>
        <rect x="98" y="53" width="65" height="47" rx="7" fill="#294b37" />
        <circle cx="111" cy="67" r="7" fill="#e7eee3" />
        <path d="M108 67a3 3 0 0 1 6 0c0 3 1.5 4 1.5 4h-9S108 70 108 67Z" stroke="#294b37" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M110 73h2" stroke="#294b37" strokeWidth="1" strokeLinecap="round" />
        <circle className={styles.browserNotificationDot} cx="157" cy="57" r="4" fill="#d57955" />
        <path d="M123 65h28M123 72h22M108 86h43" stroke="#e7eee3" strokeWidth="2" strokeLinecap="round" opacity=".8" />
      </g>
      <circle className={styles.illustrationSpark} cx="37" cy="20" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'sms') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlobWarm} cx="90" cy="72" rx="73" ry="53" fill="#f0e4d9" />
      <circle className={styles.illustrationOrbit} cx="90" cy="70" r="53" stroke="#d9c5b7" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.smsDevice}>
        <rect x="57" y="17" width="49" height="101" rx="8" fill="#fffefa" stroke="#cbd8c6" strokeWidth="1.4" />
        <path d="M72 25h19" stroke="#aab8a5" strokeWidth="2" strokeLinecap="round" />
        <rect x="64" y="35" width="35" height="67" rx="3" fill="#e8eee5" />
        <path d="M70 46h22M70 53h17" stroke="#82977e" strokeWidth="2" strokeLinecap="round" />
        <rect x="69" y="64" width="25" height="27" rx="4" fill="#fffefa" stroke="#d3ddcf" />
        <path d="M75 72h13M75 78h10M75 84h7" stroke="#9bac96" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="81.5" cy="109" r="2" fill="#aab8a5" />
      </g>
      <g className={styles.smsMessage}>
        <path d="M17 48h48a6 6 0 0 1 6 6v19a6 6 0 0 1-6 6H45l-10 8v-8H17a6 6 0 0 1-6-6V54a6 6 0 0 1 6-6Z" fill="#294b37" />
        <path d="M23 61h34M23 69h24" stroke="#f7f6f0" strokeWidth="2" strokeLinecap="round" />
        <circle cx="57" cy="69" r="2.2" fill="#d57955" />
      </g>
      <g className={styles.smsSignal}>
        <path d="M119 62a17 17 0 0 1 0 24M127 54a29 29 0 0 1 0 40" stroke="#7f9a7b" strokeWidth="2" strokeLinecap="round" />
        <circle cx="112" cy="74" r="4" fill="#d57955" />
      </g>
      <g className={styles.smsSim}>
        <path d="m137 81 18 0 7 8v21h-25V81Z" fill="#fffefa" stroke="#cbd8c6" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M143 87h11v11h-11z" fill="#e6eee3" stroke="#8ca489" strokeWidth="1" />
        <path d="M143 104h11" stroke="#a8b7a2" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle className={styles.illustrationSpark} cx="147" cy="28" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'exchange') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlob} cx="90" cy="72" rx="73" ry="53" fill="#e6ece2" />
      <circle className={styles.exchangeOrbit} cx="90" cy="70" r="52" stroke="#b9c9b5" strokeWidth="1.2" strokeDasharray="3 7" />
      <path className={styles.exchangeRoute} d="M42 61a42 42 0 0 1 78-10l5 7m-1-11 2 11-11-1M138 79a42 42 0 0 1-78 10l-5-7m1 11-2-11 11 1" stroke="#829b7e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <g className={styles.exchangeParcel}>
        <rect x="57" y="43" width="66" height="58" rx="6" fill="#fffefa" stroke="#cbd8c6" strokeWidth="1.3" />
        <path d="m57 57 33 16 33-16M90 73v28" stroke="#9caf97" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="m77 49 13 7 13-7" stroke="#d57955" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M81 83h18M81 89h12" stroke="#a8b7a2" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g className={styles.exchangeSignal}>
        <circle cx="136" cy="36" r="9" fill="#294b37" />
        <path d="m132 36 3 3 5-6" stroke="#fffefa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className={styles.illustrationSpark} cx="32" cy="104" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'productGuide') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlobWarm} cx="90" cy="72" rx="73" ry="53" fill="#f0e4d9" />
      <circle className={styles.illustrationOrbit} cx="90" cy="70" r="52" stroke="#d9c5b7" strokeWidth="1" strokeDasharray="2 7" />
      <g className={styles.guideBook}>
        <path d="M31 37a7 7 0 0 1 7-7h47v78H38a7 7 0 0 0-7 7V37Z" fill="#fffefa" stroke="#d5dfd0" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M149 37a7 7 0 0 0-7-7H95v78h47a7 7 0 0 1 7 7V37Z" fill="#fffefa" stroke="#d5dfd0" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M90 30v78" stroke="#c9d6c4" strokeWidth="1.3" />
        <path d="M43 47h29M43 55h24M43 68h32M43 76h25M105 47h29M105 55h23M105 68h30M105 76h24" stroke="#9caf97" strokeWidth="2" strokeLinecap="round" />
        <path d="M43 91h18m44 0h20" stroke="#d57955" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className={styles.guideTick}>
        <circle cx="131" cy="96" r="14" fill="#294b37" />
        <path d="m125 96 4 4 8-9" stroke="#fffefa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className={styles.illustrationSpark} cx="148" cy="22" r="3" fill="#d57955" />
    </svg>
  );
  if (type === 'network') return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlob} cx="90" cy="73" rx="72" ry="53" fill="#e6ece2" />
      <path className={styles.networkRoute} d="M28 88C41 88 42 42 69 42S94 91 119 91 139 53 154 53" stroke="#8ca489" strokeWidth="1.6" strokeDasharray="4 6" strokeLinecap="round" />
      <path d="M28 88C41 88 42 42 69 42S94 91 119 91" stroke="#294b37" strokeWidth="1.6" strokeLinecap="round" />
      <g className={styles.networkHub}>
        <circle cx="69" cy="42" r="15" fill="#fffefa" stroke="#cad7c5" />
        <rect x="60" y="36" width="18" height="14" rx="2" fill="#e7eee3" stroke="#55765b" strokeWidth="1.2" />
        <path d="m60 36 9 7 9-7M69 43v7" stroke="#55765b" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      <g className={styles.networkPoint}>
        <circle cx="28" cy="88" r="10" fill="#f0d9cb" /><circle cx="28" cy="88" r="4" fill="#d57955" />
      </g>
      <g className={styles.networkPointAlt}>
        <circle cx="119" cy="91" r="10" fill="#fffefa" stroke="#cad7c5" /><circle cx="119" cy="91" r="4" fill="#55765b" />
      </g>
      <g className={styles.networkPoint}>
        <circle cx="154" cy="53" r="10" fill="#294b37" /><path d="m150 53 3 3 5-6" stroke="#fffefa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className={styles.illustrationSpark} cx="101" cy="24" r="3" fill="#d57955" />
      <path d="M45 113h30M126 117h26" stroke="#c0cfbb" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg className={styles.illustrationSvg} viewBox="0 0 180 138" fill="none" aria-hidden="true">
      <ellipse className={styles.illustrationBlobWarm} cx="90" cy="72" rx="72" ry="53" fill="#f0e4d9" />
      <circle className={styles.illustrationOrbitSpin} cx="90" cy="68" r="44" stroke="#c3d0bd" strokeWidth="1.1" strokeDasharray="3 7" />
      <g className={styles.syncDashboard}>
        <rect x="31" y="27" width="91" height="82" rx="8" fill="#fffefa" stroke="#d7dfd2" />
        <path d="M31 45h91" stroke="#e3e8df" />
        <circle cx="42" cy="36" r="2.5" fill="#d57955" /><path d="M51 36h35" stroke="#afbcaa" strokeWidth="2" strokeLinecap="round" />
        <circle cx="47" cy="59" r="5" fill="#e5ede1" /><path d="m44.5 59 1.7 1.7 3.3-3.5" stroke="#55765b" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M59 57h42M59 63h29" stroke="#c0ccbc" strokeWidth="2" strokeLinecap="round" />
        <circle cx="47" cy="79" r="5" fill="#f2e0d5" /><path d="M59 77h37M59 83h25" stroke="#c0ccbc" strokeWidth="2" strokeLinecap="round" />
        <path d="M43 96h54" stroke="#e4e9e0" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className={styles.syncBadge}>
        <circle cx="127" cy="78" r="24" fill="#294b37" />
        <path className={styles.syncArrow} d="M119 70a11 11 0 0 1 18-3l3 4m0-7v7h-7M135 86a11 11 0 0 1-18 3l-3-4m0 7v-7h7" stroke="#f7f6f0" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path className={styles.syncCheck} d="m121 78 4 4 8-9" stroke="#e4b19a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle className={styles.illustrationSpark} cx="145" cy="31" r="3" fill="#d57955" />
      <circle cx="23" cy="103" r="3" fill="#d57955" />
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
    <main id="top" className={styles.page}>
      <ScrollRevealObserver />
      <SiteHeader isAuthenticated={isAuthenticated} />

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy} data-dz-reveal>
          
          <h1 id="hero-title">كل طلب له رحلة<br /><em>حتى بعد التسليم.</em></h1>
          <p className={styles.heroDescription}>يرسل تاجر تراك رابط التتبّع للزبون عبر SMS، مع إمكانية استخدام Telegram كقناة إضافية. ويتابع الزبون تحديثات الشحنة، ثم يجد طريقاً واضحاً لخدمات ما بعد البيع من الصفحة نفسها.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href={isAuthenticated ? "/merchant" : "/register"}>{isAuthenticated ? "افتح لوحة التاجر" : "اربط متجرك الآن"} <span aria-hidden="true">↗</span></a>
            <a className={styles.secondaryButton} href="#how-it-works">شاهد طريقة الربط <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroProof}>
            <span className={styles.heroProofMark}><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <span>رابط التتبّع عبر SMS</span><i /> <span>Telegram كخيار إضافي</span><i /> <span>استبدال أسهل</span><i /> <span>+80 شركة توصيل جزائرية</span>
          </div>
        </div>
        <TrackingPreview />
      </section>

      <section className={styles.howSection} id="how-it-works" aria-labelledby="how-title" data-dz-reveal>
        <div className={styles.sectionIntro}>
          <span className={styles.sectionEyebrow}>كيف يعمل؟</span>
          <h2 id="how-title">اربط الطلبات.<br /><em>واستمر مع الزبون بعدها.</em></h2>
          <p>جهّز قنوات التواصل والتتبّع، وامنح الزبون طريقاً واضحاً لمتابعة الطلب وطلب الاستبدال عند الحاجة.</p>
        </div>
        <div className={styles.stepsList}>
          {steps.map((step) => (
            <article className={styles.step} key={step.number} data-dz-reveal data-dz-reveal-delay={Number(step.number) * 70}>
              <span className={styles.stepNumber}>{step.number}</span>
              <div className={styles.stepCopy}><h3>{step.title}</h3><p>{step.description}</p></div>
              <span className={styles.stepArrow} aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path className={styles.stepRouteLine} d="M4 6h8c6 0 6 8 0 8H9c-4 0-4 7 0 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 4"/><circle cx="4" cy="6" r="2" fill="#D57955"/><path d="m17 17 4 4-4 4" stroke="#294b37" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.featuresSection} id="features" aria-labelledby="features-title" data-dz-reveal>
        <div className={styles.featuresHead}>
          <div><span className={styles.sectionEyebrow}>من أول تواصل إلى ما بعد التسليم</span><h2 id="features-title">تتبّع ورسائل.<br /><em>وخدمات ما بعد البيع.</em></h2></div>
          <p>أرسل رابط التتبّع عبر SMS، واجعل متابعة الطلب والاستبدال أوضح للزبون من صفحة واحدة.</p>
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
                <span className={styles.featureRowArrow} aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path className={styles.featureRowArrowRoute} d="M4 5h8c7 0 7 8 0 8H9c-4 0-4 7 0 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="3 4"/><circle cx="4" cy="5" r="2" fill="#D57955"/><path d="m16 16 4 4-4 4" stroke="#294B37" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
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
          <svg className={styles.deliveryNetworkIllustration} viewBox="0 0 440 330" fill="none">
            <defs><linearGradient id="routeGlow" x1="46" y1="252" x2="386" y2="76" gradientUnits="userSpaceOnUse"><stop stopColor="#d57955"/><stop offset=".48" stopColor="#718b70"/><stop offset="1" stopColor="#294b37"/></linearGradient></defs>
            <path className={styles.splitRouteUnderlay} d="M20 258C102 258 94 185 179 185S266 112 337 112H421" stroke="url(#routeGlow)" strokeWidth="1.4" strokeDasharray="3 9" strokeLinecap="round"/>
            <path className={styles.splitRouteProgress} d="M20 258C102 258 94 185 179 185S266 112 337 112H421" stroke="#6f8a6e" strokeWidth="1.6" strokeDasharray="5 11" strokeLinecap="round"/>
            <circle className={styles.splitOrbit} cx="220" cy="166" r="93" stroke="#aebfab" strokeWidth="1" strokeDasharray="2 8"/>
            <circle className={styles.splitOrbitReverse} cx="220" cy="166" r="66" stroke="#d7c6b9" strokeWidth="1" strokeDasharray="2 8"/>
            <g className={styles.splitHub}>
              <circle cx="179" cy="185" r="34" fill="#e2eade"/>
              <circle cx="179" cy="185" r="25" fill="#fffefa" stroke="#c7d4c1"/>
              <path d="M162 178 179 168l17 10v18h-34v-18Z" fill="#e8eee4" stroke="#55765b" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M172 196v-11h14v11M167 179h24" stroke="#55765b" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M171 173h16" stroke="#d57955" strokeWidth="2" strokeLinecap="round"/>
            </g>
            <g className={styles.splitParcelNode}>
              <circle cx="337" cy="112" r="22" fill="#f0ddd1"/>
              <circle cx="337" cy="112" r="15" fill="#fffefa" stroke="#d8b7a5"/>
              <path d="m328 107 9-5 9 5v10l-9 5-9-5v-10Z" fill="#e8c8b7" stroke="#b96c4c" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="m328 107 9 5 9-5m-9 5v10" stroke="#b96c4c" strokeWidth="1.2" strokeLinejoin="round"/>
            </g>
            <g className={styles.splitEndpoint}>
              <circle cx="421" cy="112" r="12" fill="#294b37"/>
              <path d="m416 112 3 3 6-7" stroke="#fffefa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
            <g className={styles.splitStartNode}><circle cx="20" cy="258" r="10" fill="#f0ddd1"/><circle cx="20" cy="258" r="4" fill="#d57955"/></g>
            <g className={styles.splitMiniCard}>
              <rect x="35" y="69" width="94" height="49" rx="7" fill="#fffefa" stroke="#d9e2d5"/>
              <circle cx="48" cy="82" r="3" fill="#d57955"/><path d="M57 81h48" stroke="#a4b5a0" strokeWidth="2" strokeLinecap="round"/>
              <path d="M47 95h62M47 102h41" stroke="#d2ddd0" strokeWidth="2" strokeLinecap="round"/>
              <path d="M113 105h7" stroke="#d57955" strokeWidth="2" strokeLinecap="round"/>
            </g>
            <g className={styles.splitMiniCardAlt}>
              <rect x="276" y="218" width="114" height="51" rx="7" fill="#fffefa" stroke="#d9e2d5"/>
              <circle cx="291" cy="233" r="4" fill="#e4eee0"/><path d="m289 233 1.5 1.5 3-3" stroke="#55765b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M302 231h69M288 246h81M288 254h47" stroke="#cbd7c7" strokeWidth="2" strokeLinecap="round"/>
            </g>
            <circle className={styles.splitSignal} cx="245" cy="164" r="4" fill="#d57955"/>
          </svg>
        </div>
        <div className={styles.splitCopy} data-dz-reveal>
          <span className={styles.sectionEyebrow}>منظومة التوصيل الجزائرية</span>
          <h2 id="split-title">حالة الطلب واضحة<br /><em>بدل عشرات الرسائل.</em></h2>
          <p>اعرض للزبون صفحة تتبّع تحمل هوية متجرك. إذا ربطت شركة توصيل مدعومة، تظهر التحديثات التي ترسلها؛ وإلا يمكنك تغيير الحالة من لوحة التاجر.</p>
          <div className={styles.carrierNames} aria-label="أمثلة على شركات توصيل مدعومة"><span>Yalidine</span><i /><span>ZR Express</span><i /><span>و80+ شركة أخرى</span></div>
          <a className={styles.textLink} href="/register">ابدأ إعداد الربط <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing" aria-labelledby="pricing-title" data-dz-reveal>
        <div className={styles.pricingHead}>
          <span className={styles.sectionEyebrow}>تسعير حسب روابط التتبّع</span>
          <h2 id="pricing-title">سعر واضح.<br /><em>حسب حجم متجرك.</em></h2>
          <p>باقات واضحة للمتاجر من البداية وحتى 500 رابط تتبّع شهرياً. وللحجم الأكبر، نتفق معك على باقة تناسب نشاطك.</p>
        </div>
        <div className={styles.pricingList}>
          <article className={styles.priceRow}>
            <div><span className={styles.priceOrders}>حتى 30 رابط تتبّع / شهر</span><h3>مجاني</h3></div>
            <div className={styles.priceAmount}><strong>0</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>ابدأ مجاناً <span aria-hidden="true">↗</span></a>
          </article>
          <article className={styles.priceRow}>
            <div><span className={styles.priceOrders}>حتى 100 رابط تتبّع / شهر</span><h3>الأساسية</h3></div>
            <div className={styles.priceAmount}><strong>1,000</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>اختر الخطة <span aria-hidden="true">↗</span></a>
          </article>
          <article className={styles.priceRow}>
            <div><span className={styles.priceOrders}>حتى 200 رابط تتبّع / شهر</span><h3>النمو</h3></div>
            <div className={styles.priceAmount}><strong>1,800</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>اختر الخطة <span aria-hidden="true">↗</span></a>
          </article>
          <article className={styles.priceRow + ' ' + styles.priceRowUnlimited}>
            <div><span className={styles.priceOrders}>حتى 500 رابط تتبّع / شهر</span><h3>الاحترافية</h3></div>
            <div className={styles.priceAmount}><strong>2,500</strong><span>دج / شهرياً</span></div>
            <a href="/register" className={styles.priceLink}>اختر الخطة <span aria-hidden="true">↗</span></a>
          </article>
          <CustomPlanRequest />
        </div>
        <p className={styles.pricingNote}>يُحتسب كل طلب جديد برابط تتبّع واحد ضمن الاستهلاك الشهري. تحديثات شركة التوصيل وإعادة إرسال الأحداث لا تستهلك روابط إضافية. للمتاجر ذات الحجم الأكبر، تواصل معنا للحصول على عرض مخصص.</p>
      </section>

      <section className={styles.faqSection} id="faq" aria-labelledby="faq-title" data-dz-reveal>
        <div className={styles.faqIntro}><span className={styles.sectionEyebrow}>قبل أن تبدأ</span><h2 id="faq-title">الربطات والتتبّع،<br /><em>بلا أسئلة معلّقة.</em></h2></div>
        <FaqAccordion faqs={faqs} />
      </section>

      <section className={styles.finalCta} data-dz-reveal>
        <span className={styles.finalCtaEyebrow}>ابدأ من هنا</span>
        <h2>اهتم بكل رحلة.<br /><em>من الطلب إلى ما بعد البيع.</em></h2>
        <p>اربط متجرك، واختر قنوات الرسائل، وقدّم لزبائنك تتبّعاً واضحاً وخدمات ما بعد الاستلام.</p>
        <a className={styles.finalCtaButton} href="/register">ابدأ ربط متجرك <span aria-hidden="true">↗</span></a>
        <svg className={styles.ctaRouteArt} viewBox="0 0 240 180" fill="none" aria-hidden="true"><path className={styles.ctaRoutePath} d="M5 22h65c45 0 45 48 0 48H42c-38 0-38 45 0 45h64c39 0 39 43 77 43h52" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 7" strokeLinecap="round"/><circle className={styles.ctaRouteNode} cx="5" cy="22" r="4" fill="#D57955"/><circle className={styles.ctaRouteNode} cx="70" cy="70" r="4" fill="currentColor"/><circle className={styles.ctaRouteNode} cx="106" cy="115" r="4" fill="#D57955"/><circle className={styles.ctaRouteNode} cx="235" cy="158" r="4" fill="currentColor"/></svg>
      </section>

      <SiteFooter isAuthenticated={isAuthenticated} />
    </main>
  );
}
