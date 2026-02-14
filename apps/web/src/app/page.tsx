'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { fetchAllNovelEpisodeGroups } from '@/lib/novels';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const [novelGroups, setNovelGroups] = useState<Awaited<ReturnType<typeof fetchAllNovelEpisodeGroups>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNovels() {
      try {
        const data = await fetchAllNovelEpisodeGroups();
        setNovelGroups(data);
      } catch (error) {
        console.error('Failed to load novels:', error);
      } finally {
        setLoading(false);
      }
    }
    loadNovels();
  }, []);

  const episodeCount = novelGroups.reduce((total, group) => total + group.episodes.length, 0);
  const novelCount = novelGroups.length;
  const locale = i18n.language as 'ko' | 'en';

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-12">
        <p className="text-center text-black">{t('home.badge')}...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-12">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Badge variant="solid">{t('home.badge')}</Badge>
          <h1 className="font-display text-4xl leading-tight text-black md:text-5xl">
            {t('home.title')}
          </h1>
          <p className="text-base text-black md:text-lg">{t('home.description')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">{t('home.buttonLatest')}</Button>
            <Button size="lg" variant="outline">
              {t('home.buttonList')}
            </Button>
          </div>
        </div>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="font-display text-2xl">{t('stats.title')}</CardTitle>
            <CardDescription>{t('stats.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-black sm:grid-cols-2">
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-black">{t('stats.novels')}</p>
              <p className="mt-2 text-2xl font-semibold text-black">{episodeCount}</p>
              <p className="mt-2">{t('stats.novelsCount')}</p>
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-black">{t('stats.series')}</p>
              <p className="mt-2 text-2xl font-semibold text-black">{novelCount}</p>
              <p className="mt-2">{t('stats.seriesCount')}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-16 grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-2xl text-black">{t('episodes.title')}</p>
            <p className="mt-1 text-sm text-black">{t('episodes.description')}</p>
          </div>
          <Badge variant="solid">{t('episodes.badge')}</Badge>
        </div>

        {novelGroups.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('episodes.noNovel')}</CardTitle>
              <CardDescription>{t('episodes.noNovelDescription')}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-6">
            {novelGroups.map((group) => (
              <Card key={group.novel.id} className="overflow-hidden">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Novel {group.novel.id.slice(0, 8)}</Badge>
                    <Badge variant="solid">{group.novel.genre}</Badge>
                    <Badge variant="solid">{group.episodes.length} Episodes</Badge>
                  </div>
                  <CardTitle className="font-display text-2xl">{group.novel.title}</CardTitle>
                  <CardDescription>
                    {new Date(group.novel.created_at).toLocaleDateString(locale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  {group.episodes.length === 0 ? (
                    <div className="border-2 border-black bg-white p-4 text-sm text-black">
                      {t('episodes.noEpisode')}
                    </div>
                  ) : (
                    <div className="grid gap-6">
                      {group.episodes.map((episode) => (
                        <div key={episode.id} className="border-2 border-black bg-white p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>Episode {episode.episode_number}</Badge>
                            <Badge>
                              {new Date(episode.created_at).toLocaleDateString(locale, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Badge>
                          </div>
                          <div className="mt-4 space-y-4 text-sm leading-relaxed text-black">
                            {episode.body.split('\n').map((line, index) => (
                              <p key={`${episode.id}-line-${index}`}>
                                {line.length === 0 ? '\u00A0' : line}
                              </p>
                            ))}
                          </div>
                          <div className="mt-4">
                            <Link
                              href={`/episodes/${episode.id}`}
                              className="inline-flex items-center text-sm font-semibold text-black transition hover:underline"
                            >
                              {t('episodes.viewEpisode')}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
