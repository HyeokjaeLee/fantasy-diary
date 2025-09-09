import '@/configs/styles/globals.css';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { pretendard } from '@/configs/fonts';

import { ClientProvider } from './_components/ClientProvider';
import { ServerProvider } from './_components/ServerProvider';
export const metadata: Metadata = {
  title: 'Fantasy Diary',
  description: 'Your personal fantasy diary',
};

const locales = ['ko', 'en'];

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale)) notFound();

  return (
    <html lang={locale} className="size-full">
      <body
        className={`${pretendard.variable} ${pretendard.className} relative size-full antialiased`}
      >
        <ServerProvider>
          <ClientProvider>
            <div className="size-full">{children}</div>
          </ClientProvider>
        </ServerProvider>
      </body>
    </html>
  );
}
