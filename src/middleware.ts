import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  // A list of all locales that are supported
  locales: ['ko', 'en'],
 
  // Used when no locale matches
  defaultLocale: 'ko'
});
 
export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ko|en)/:path*']
};