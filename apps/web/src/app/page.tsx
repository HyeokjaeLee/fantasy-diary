import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchRecentEpisodes } from '@/lib/novels';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const episodes = await fetchRecentEpisodes();
  const novelCount = new Set(episodes.map((episode) => episode.novel_id)).size;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-12">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Badge variant="moss">Serialized Library</Badge>
          <h1 className="font-display text-4xl leading-tight text-ink-950 md:text-5xl">
            발행된 소설을
            <br />
            서늘한 서가처럼 정리했습니다.
          </h1>
          <p className="text-base text-ink-700 md:text-lg">
            agent-server가 발행한 판타지 연재를 한 곳에서 읽고, 각 회차를 부드럽게
            넘길 수 있도록 서버사이드 렌더링으로 구성했습니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">최신 소설 감상하기</Button>
            <Button size="lg" variant="outline">
              발행 목록 보기
            </Button>
          </div>
        </div>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Library Stats</CardTitle>
            <CardDescription>
              현재 라이브러리에 등록된 소설과 에피소드 현황입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-ink-700 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-950/10 bg-parchment-100/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-ink-600">Novels</p>
              <p className="mt-2 text-2xl font-semibold text-ink-900">{episodes.length}</p>
              <p className="mt-2">최근 발행된 에피소드 수</p>
            </div>
            <div className="rounded-2xl border border-ink-950/10 bg-parchment-100/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-ink-600">Series</p>
              <p className="mt-2 text-2xl font-semibold text-ink-900">{novelCount}</p>
              <p className="mt-2">연재 진행 중인 소설 수</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-16 grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-2xl text-ink-950">발행된 에피소드</p>
            <p className="mt-1 text-sm text-ink-700">최신 발행 순으로 정렬됩니다.</p>
          </div>
          <Badge variant="ember">SSR</Badge>
        </div>

        {episodes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>아직 발행된 에피소드가 없습니다</CardTitle>
              <CardDescription>
                agent-server가 첫 에피소드를 발행하면 이곳에 자동으로 표시됩니다.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {episodes.map((episode) => (
              <Card key={episode.id} className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="stone">Novel {episode.novel_id.slice(0, 8)}</Badge>
                    <Badge variant="moss">Episode {episode.episode_number}</Badge>
                  </div>
                  <CardTitle className="font-display text-2xl">연재 회차</CardTitle>
                  <CardDescription>
                    {new Date(episode.created_at).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-6">
                  <p className="text-sm leading-relaxed text-ink-700">
                    {episode.body.length > 220
                      ? `${episode.body.slice(0, 220)}...`
                      : episode.body}
                  </p>
                  <div className="mt-auto">
                    <Link
                      href={`/episodes/${episode.id}`}
                      className="inline-flex items-center text-sm font-semibold text-ink-900 transition hover:text-ember-600"
                    >
                      에피소드 읽기 →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
