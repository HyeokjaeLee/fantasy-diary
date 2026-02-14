import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { RootLayoutClient } from './layout-client';

import './globals.css';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  variable: '--font-noto-sans-kr',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Fantasy Diary Library',
  description: 'A library where you can read published novels',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="font-noto-sans-kr min-h-screen bg-white text-black">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
