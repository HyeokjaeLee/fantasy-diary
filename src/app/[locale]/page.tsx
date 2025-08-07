import { useTranslations } from 'next-intl';
import React from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function Page() {
  const t = useTranslations('HomePage');

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
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="text-center text-white">
          <h1 className="mb-4 text-4xl font-bold">{t('title')}</h1>
          <p className="text-xl">{t('welcome')}</p>
        </div>
      </article>
    </div>
  );
}
