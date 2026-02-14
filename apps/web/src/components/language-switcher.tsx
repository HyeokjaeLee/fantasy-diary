'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLocale = i18n.language as Locale;
  const locales: { code: Locale; label: string }[] = [
    { code: 'ko', label: 'KO' },
    { code: 'en', label: 'EN' },
  ];

  const changeLanguage = (locale: Locale) => {
    i18n.changeLanguage(locale);
  };

  return (
    <div className="flex items-center gap-1">
      {locales.map((locale) => (
        <Button
          key={locale.code}
          size="sm"
          variant={currentLocale === locale.code ? 'primary' : 'outline'}
          onClick={() => changeLanguage(locale.code)}
          className="min-w-[3rem]"
        >
          {locale.label}
        </Button>
      ))}
    </div>
  );
}
