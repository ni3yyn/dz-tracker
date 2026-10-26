import '../styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://tajertrack.vercel.app'),
  title: { default: 'تاجر تراك | نظام تتبع طلبيات جاهظ', template: '%s | تاجر تراك' },
  description: 'اربط متجرك عبر SDK أو Webhook، أرسل روابط التتبّع عبر Telegram، وتابع حالات الطلب يدوياً أو عبر شركات توصيل جزائرية مدعومة.',
  applicationName: 'تاجر تراك',
  openGraph: {
    type: 'website',
    locale: 'ar_DZ',
    siteName: 'تاجر تراك',
    title: 'تاجر تراك | نظام تتبع طلبيات جاهز',
    description: 'ليس لديك نظام تتبع للزبائن؟ نظّم تتبّع طلبات متجرك مع تاجر تراك. اربط متجرك، خصّص صفحات التتبّع بهويتك التجارية.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'تاجر تراك | نظام تتبع طلبيات جاهز',
    description: 'ليس لديك نظام تتبع للزبائن؟ نظّم تتبّع طلبات متجرك مع تاجر تراك. اربط متجرك، خصّص صفحات التتبّع بهويتك التجارية.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}