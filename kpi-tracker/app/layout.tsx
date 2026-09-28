import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTM KPIs',
  description: 'Otoma GTM KPIs from Salesforce',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
