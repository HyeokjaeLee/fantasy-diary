import '@/configs/styles/globals.css';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { Providers } from '@/components/Providers';
import { pretendard } from '@/configs/fonts';

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

  const messages = await getMessages();

  return (
    <html lang={locale} className="size-full">
      <body
        className={`${pretendard.variable} ${pretendard.className} relative size-full antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <div className="size-full">{children}</div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
