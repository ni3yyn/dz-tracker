import '../styles/globals.css';

export const metadata = {
  title: { default: 'تاجر تراك | تتبّع الطلبات', template: '%s | تاجر تراك' },
  description: 'اربط متجرك عبر SDK أو Webhook، أرسل روابط التتبّع عبر Telegram، وتابع حالات الطلب يدوياً أو عبر شركات توصيل جزائرية مدعومة.',
  applicationName: 'تاجر تراك',
  openGraph: {
    type: 'website',
    locale: 'ar_DZ',
    siteName: 'تاجر تراك',
    title: 'تاجر تراك | تتبّع الطلبات',
    description: 'تكاملات الطلبات والتوصيل، وروابط تتبّع للعملاء عبر Telegram.',
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