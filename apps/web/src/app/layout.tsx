import '../styles/globals.css';

export const metadata = {
  title: 'DZ Tracking — Post-purchase infrastructure for COD commerce',
  description: 'Turn where-is-my-order questions into automated revenue with branded tracking, carrier sync, and WhatsApp alerts.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
