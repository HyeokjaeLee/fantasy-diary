import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  // Get the accept-language header
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  
  // Default to Korean
  let locale = 'ko';
  
  // Check if the user prefers English
  if (acceptLanguage && acceptLanguage.includes('en') && !acceptLanguage.includes('ko')) {
    locale = 'en';
  }
  
  // Server-side redirect to the appropriate locale
  redirect(`/${locale}`);
}