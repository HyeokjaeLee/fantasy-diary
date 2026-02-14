'use client';

import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nType } from 'i18next';
import initI18n from './index';

let i18nInstance: I18nType | null = null;

function getI18nInstance(): I18nType {
  if (!i18nInstance) {
    i18nInstance = initI18n;
  }
  return i18nInstance;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const i18n = getI18nInstance();

  useEffect(() => {
    const storedLang = localStorage.getItem('i18nextLng');
    if (storedLang && i18n.language !== storedLang) {
      i18n.changeLanguage(storedLang);
    }
  }, [i18n]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
