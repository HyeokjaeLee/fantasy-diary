'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('인증 콜백 에러:', error);
        router.push('/auth/signin?error=callback_error');

        return;
      }

      if (data.session) {
        router.push('/');
      } else {
        router.push('/auth/signin');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p>로그인 처리 중...</p>
      </div>
    </div>
  );
}