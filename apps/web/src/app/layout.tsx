import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import '../styles/globals.css';

const arabicFont = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata = {
  title: 'DZ Tracking — بنية ما بعد الشراء للتجارة الإلكترونية',
  description: 'حوّل أسئلة أين طلبي إلى إيرادات مؤتمتة مع تتبع مخصص ومزامنة شركات الشحن وتنبيهات واتساب.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={arabicFont.variable}>{children}</body>
    </html>
  );
}
