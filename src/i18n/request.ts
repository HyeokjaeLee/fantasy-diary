import { getRequestConfig } from 'next-intl/server';

// Can be imported from a shared config
const locales = ['ko', 'en'];

export default getRequestConfig(async ({ locale }) => {
  // Ensure that the incoming locale is valid
  if (!locale || !locales.includes(locale)) {
    locale = 'ko';
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
