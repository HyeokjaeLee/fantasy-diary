import type { AbstractIntlMessages } from 'next-intl';

export type Messages = AbstractIntlMessages;

export type Locale = 'ko' | 'en';

export const locales: readonly Locale[] = ['ko', 'en'] as const;

export const defaultLocale: Locale = 'ko';