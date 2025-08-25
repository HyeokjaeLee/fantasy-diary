'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const t = useTranslations('auth.callback');
  const locale = useLocale();

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('인증 콜백 에러:', error);
        router.push(`/${locale}/auth/signin?error=callback_error`);

        return;
      }

      if (data.session) {
        router.push(`/${locale}`);
      } else {
        router.push(`/${locale}/auth/signin`);
      }
    };

    handleAuthCallback();
  }, [router, locale]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p>{t('processing')}</p>
      </div>
    </div>
  );
}