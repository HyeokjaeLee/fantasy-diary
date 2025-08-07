'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuthContext } from '@/contexts/AuthContext';

export default function Page() {
  const t = useTranslations('HomePage');
  const { user, loading, signOut } = useAuthContext();
  const router = useRouter();

  // 로그인 없이도 사용 가능하도록 리디렉션 제거
  // useEffect(() => {
  //   if (!loading && !user) {
  //     router.push('/auth/signin');
  //   }
  // }, [user, loading, router]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/auth/signin');
    } catch (error) {
      console.error('로그아웃 에러:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative size-full">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute left-0 top-0 -z-10 h-full w-full object-cover blur-sm"
      >
        <source src="/videos/background.webm" type="video/webm" />
      </video>
      <article className="flex size-full items-center justify-center bg-black/90">
        <div className="absolute right-4 top-4 flex gap-2">
          {user ? (
            <button
              onClick={handleSignOut}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
            >
              로그아웃
            </button>
          ) : (
            <button
              onClick={() => router.push('/auth/signin')}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              로그인
            </button>
          )}
          <LanguageSwitcher />
        </div>
        <div className="text-center text-white">
          <h1 className="mb-4 text-4xl font-bold">{t('title')}</h1>
          <p className="mb-4 text-xl">{t('welcome')}</p>
          {user && (
            <p className="text-sm opacity-80">
              환영합니다, {user.email}님!
            </p>
          )}
        </div>
      </article>
    </div>
  );
}
