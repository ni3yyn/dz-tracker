import '../styles/globals.css';

export const metadata = {
  title: 'منصة التتبع',
  description: 'تتبع طلباتك بسهولة',
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