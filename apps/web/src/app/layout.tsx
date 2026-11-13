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
      description: 'منصة لتتبّع طلبات المتاجر الإلكترونية في الجزائر، ترسل رابط التتبّع عبر SMS وتدعم Telegram كقناة إضافية، مع متابعة الشحن وطلبات الاستبدال بعد التسليم.',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'E-commerce order tracking and after-sales management',
      operatingSystem: 'Web browser',
      featureList: [
        'إرسال رابط صفحة تتبّع الطلب عبر SMS',
        'Telegram كقناة إضافية اختيارية',
        'صفحة تتبّع تحمل هوية المتجر',
        'متابعة تحديثات شركات التوصيل',
        'طلبات الاستبدال ومتابعة شحنة المنتج البديل',
      ],
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'E-commerce merchants in Algeria',
      },
      availableLanguage: ['Arabic', 'French'],
      areaServed: {
        '@type': 'Country',
        name: 'Algeria',
      },
      creator: { '@id': organizationId },
      isPartOf: { '@id': `${siteUrl}/#website` },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'تاجر تراك | تتبّع طلبات المتاجر الجزائرية عبر SMS', template: '%s | تاجر تراك' },
  description: 'تاجر تراك منصة لتتبّع طلبات المتاجر الإلكترونية في الجزائر. ترسل رابط التتبّع عبر SMS، مع Telegram كخيار إضافي، وتسهّل متابعة الشحن وطلبات الاستبدال بعد التسليم.',
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
    description: 'منصة للمتاجر الإلكترونية في الجزائر: إرسال رابط التتبّع عبر SMS، Telegram كخيار إضافي، ومتابعة الطلبات والاستبدال بعد التسليم.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'تاجر تراك | تتبّع طلبات المتاجر الجزائرية عبر SMS',
    description: 'منصة للمتاجر الإلكترونية في الجزائر: إرسال رابط التتبّع عبر SMS، Telegram كخيار إضافي، ومتابعة الطلبات والاستبدال بعد التسليم.',
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
