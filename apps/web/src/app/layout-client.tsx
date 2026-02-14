'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nProvider } from '@/lib/i18n/provider';
import { LanguageSwitcher } from '@/components/language-switcher';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language, mounted]);

  if (!mounted) {
    return null;
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="border-b-2 border-black bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="font-display text-2xl tracking-[0.2em] text-black">
              {t('header.title')}
            </p>
            <p className="mt-1 text-sm text-black">{t('header.subtitle')}</p>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <div className="hidden items-center gap-3 text-sm text-black md:flex">
              <span className="rounded-none border-2 border-black bg-white px-3 py-1">
                {t('header.ssrLibrary')}
              </span>
              <span className="rounded-none border-2 border-black bg-white px-3 py-1">
                {t('header.nextjs')}
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t-2 border-black bg-white py-6 text-center text-xs text-black">
        {t('footer.text')}
      </footer>
    </div>
  );
}

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <LayoutContent>{children}</LayoutContent>
    </I18nProvider>
  );
}
