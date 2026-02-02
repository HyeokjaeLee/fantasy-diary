import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';

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
  description: '발행된 소설을 읽을 수 있는 판타지 다이어리 라이브러리입니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="font-noto-sans-kr min-h-screen bg-parchment-50 text-ink-900">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(196,106,57,0.08),transparent_48%),radial-gradient(circle_at_20%_80%,rgba(90,123,106,0.12),transparent_45%)]" />
        <div className="relative flex min-h-screen flex-col">
          <header className="border-b border-ink-950/10 bg-parchment-50/80 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
              <div>
                <p className="font-display text-2xl tracking-[0.2em] text-ink-950">
                  FANTASY DIARY
                </p>
                <p className="mt-1 text-sm text-ink-700">
                  agent-server가 발행한 소설을 모아두는 서재
                </p>
              </div>
              <div className="hidden items-center gap-3 text-sm text-ink-700 md:flex">
                <span className="rounded-full border border-ink-950/10 bg-parchment-100 px-3 py-1">
                  SSR Library
                </span>
                <span className="rounded-full border border-ink-950/10 bg-parchment-100 px-3 py-1">
                  Next.js 16
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-ink-950/10 bg-parchment-50/80 py-6 text-center text-xs text-ink-600">
            판타지 다이어리 라이브러리 · 모든 소설은 SSR로 제공됩니다.
          </footer>
        </div>
      </body>
    </html>
  );
}
