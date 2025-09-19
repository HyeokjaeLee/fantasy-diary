'use client';

import { useState } from 'react';

import { trpc } from '@/configs/trpc';

type StyleOption = '리얼리즘' | '드라마' | '스릴러' | '호러' | '디스토피아' | '느와르';
type LengthOption = '짧은 글' | '중편' | '장편';

export default function StoryTestPage() {
  const [topic, setTopic] = useState<string>('Escape from Seoul');
  const [style, setStyle] = useState<StyleOption>('호러');
  const [length, setLength] = useState<LengthOption>('중편');
  const [chapters, setChapters] = useState<number>(3);

  const mutation = trpc.story.generate.useMutation();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mutation.isPending) return;

    mutation.mutate({ topic, style, length, chapters });
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Story Generator Test</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="topic" className="block text-sm font-medium">
            주제(Topic)
          </label>
          <input
            id="topic"
            type="text"
            className="w-full rounded border px-3 py-2"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예) 지하철이 멈춘 밤, 잠실에서 강남까지"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1 space-y-1">
            <label htmlFor="style" className="block text-sm font-medium">
              장르(Style)
            </label>
            <select
              id="style"
              className="w-full rounded border px-3 py-2"
              value={style}
              onChange={(e) => setStyle(e.target.value as StyleOption)}
            >
              {(['리얼리즘', '드라마', '스릴러', '호러', '디스토피아', '느와르'] as const).map(
                (opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="flex-1 space-y-1">
            <label htmlFor="length" className="block text-sm font-medium">
              분량(Length)
            </label>
            <select
              id="length"
              className="w-full rounded border px-3 py-2"
              value={length}
              onChange={(e) => setLength(e.target.value as LengthOption)}
            >
              {(['짧은 글', '중편', '장편'] as const).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="w-32 space-y-1">
            <label htmlFor="chapters" className="block text-sm font-medium">
              장 수
            </label>
            <input
              id="chapters"
              type="number"
              min={1}
              max={10}
              className="w-full rounded border px-3 py-2"
              value={chapters}
              onChange={(e) => setChapters(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? '생성 중…' : '소설 생성하기'}
        </button>
      </form>

      {mutation.error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
          에러: {mutation.error.message}
        </div>
      ) : null}

      {mutation.data ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">생성 결과</h2>
          <article className="prose max-w-none whitespace-pre-wrap rounded border p-4">
            {mutation.data.content}
          </article>

          <details className="rounded border p-3">
            <summary className="cursor-pointer select-none text-sm text-gray-600">
              저장 응답 보기
            </summary>
            <pre className="overflow-auto text-sm">{JSON.stringify(mutation.data.saved, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}
