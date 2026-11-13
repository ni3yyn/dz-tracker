import '../styles/globals.css';
import { GlobalDialogProvider } from '../components/GlobalDialogProvider';
import type { Metadata } from 'next';

const siteUrl = 'https://tajertrack.vercel.app';
const organizationId = `${siteUrl}/#organization`;

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: 'TajerTrack',
      alternateName: ['تاجر تراك'],
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icons/icon-512.png`,
      },
      areaServed: {
        '@type': 'Country',
        name: 'Algeria',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'TajerTrack | تاجر تراك',
      inLanguage: ['ar-DZ', 'fr-DZ'],
      publisher: { '@id': organizationId },
    },
    {
      '@type': ['SoftwareApplication', 'WebApplication'],
      '@id': `${siteUrl}/#software`,
      name: 'TajerTrack',
      alternateName: 'تاجر تراك',
      url: siteUrl,
      description: 'منصة جزائرية لتتبّع طلبات المتاجر الإلكترونية. ترسل رابط التتبّع عبر SMS من رقم التاجر وشريحته عبر بوابة Android مدمجة، دون رسوم SMS لكل رسالة من تاجر تراك؛ وتبقى أي تكلفة حسب باقة متعامل الهاتف.',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'E-commerce order tracking and after-sales management',
      operatingSystem: 'Web browser',
      featureList: [
        'إرسال رابط صفحة تتبّع الطلب عبر SMS من رقم التاجر وشريحته الشخصية عبر بوابة Android مدمجة',
        'لا تفرض تاجر تراك رسوماً على كل رسالة SMS ولا تبيع رصيد رسائل؛ أي تكلفة تخضع لباقات متعاملي الهاتف',
        'Telegram كقناة إضافية اختيارية',
        'صفحة تتبّع تحمل هوية المتجر',
        'متابعة تحديثات شركات التوصيل المتصلة أو الحالات التي يسجلها التاجر',
        'طلبات الاستبدال ومتابعة شحنة المنتج البديل من رابط التتبّع الأصلي عند تفعيل الميزة',
      ],
      offers: {
        '@type': 'Offer',
        name: 'الخطة المجانية',
        description: 'تشمل حتى 30 رابط تتبّع شهرياً.',
        price: 0,
        priceCurrency: 'DZD',
        url: `${siteUrl}/#pricing`,
        eligibleRegion: {
          '@type': 'Country',
          name: 'Algeria',
        },
      },
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'E-commerce merchants in Algeria',
      },
      inLanguage: ['ar-DZ', 'fr-DZ'],
      creator: { '@id': organizationId },
      isPartOf: { '@id': `${siteUrl}/#website` },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'تاجر تراك | تتبّع طلبات المتاجر الجزائرية عبر SMS', template: '%s | تاجر تراك' },
  description: 'تاجر تراك منصة جزائرية لتتبّع طلبات المتاجر الإلكترونية. ترسل رابط التتبّع عبر SMS من رقم التاجر وشريحته، دون رسوم لكل رسالة من تاجر تراك؛ وتبقى أي تكلفة حسب باقة متعامل الهاتف.',
  applicationName: 'تاجر تراك',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'تاجر تراك',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'ar_DZ',
    siteName: 'تاجر تراك',
    title: 'تاجر تراك | تتبّع طلبات المتاجر الجزائرية عبر SMS',
    description: 'منصة للمتاجر الإلكترونية في الجزائر: إرسال رابط التتبّع عبر SMS من رقم التاجر وشريحته، دون رسوم لكل رسالة من تاجر تراك، مع متابعة الشحن وطلبات الاستبدال.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'تاجر تراك | تتبّع طلبات المتاجر الجزائرية عبر SMS',
    description: 'منصة للمتاجر الإلكترونية في الجزائر: إرسال رابط التتبّع عبر SMS من رقم التاجر وشريحته، دون رسوم لكل رسالة من تاجر تراك، مع متابعة الشحن وطلبات الاستبدال.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <GlobalDialogProvider>{children}</GlobalDialogProvider>
      </body>
    </html>
  );
}
