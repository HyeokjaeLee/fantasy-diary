import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchEpisodeDetail } from '@/lib/novels';

export const dynamic = 'force-dynamic';

type EpisodeDetailPageProps = {
  params: { episodeId: string };
};

export default async function EpisodeDetailPage({ params }: EpisodeDetailPageProps) {
  const episode = await fetchEpisodeDetail(params.episodeId);

  if (!episode) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-20 pt-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="moss">Episode {episode.episode_number}</Badge>
            <Badge variant="stone">Novel {episode.novel_id.slice(0, 8)}</Badge>
          </div>
          <h1 className="font-display text-4xl text-ink-950 md:text-5xl">발행된 에피소드</h1>
          <p className="text-sm text-ink-700">
            {new Date(episode.created_at).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink-900/20 bg-parchment-50 px-6 text-base font-semibold text-ink-900 transition hover:bg-parchment-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment-50"
        >
          서재로 돌아가기
        </Link>
      </div>

      <section className="mt-10">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Episode Text</CardTitle>
            <CardDescription>발행된 회차의 본문을 확인하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-7 text-ink-700">
              {episode.body}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
