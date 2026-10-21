import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans-face', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'LIBRA RP — Admin Recruitment System', template: '%s · LIBRA RP' },
  description: 'Integrity. Authority. Excellence. The official Libra RP administrative recruitment and examination platform.',
  robots: { index: false, follow: false },
  icons: { icon: '/libra-mark.svg' },
};

export const viewport: Viewport = {
  themeColor: '#08090D',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
