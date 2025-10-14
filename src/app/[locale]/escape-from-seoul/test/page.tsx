'use client';

import { useState } from 'react';

import type { WriteChapterResponse } from '@/app/api/escape-from-seoul/_types/novel';
import { trpc } from '@/configs/trpc';

export default function NovelTestPage() {
  const [datetime, setDatetime] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WriteChapterResponse | null>(null);
  const generateChapterMutation =
    trpc.escapeFromSeoul.generateChapter.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!datetime) {
      alert('날짜를 입력해주세요');

      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const data = await generateChapterMutation.mutateAsync({
        currentTime: datetime,
      });
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        chapterId: '',
        content: '',
        stats: {
          wordCount: 0,
          charactersAdded: 0,
          placesAdded: 0,
          executionTime: 0,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
      generateChapterMutation.reset();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">Novel Generation Test</h1>

        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-lg bg-white p-6 shadow"
        >
          <div className="mb-4">
            <label htmlFor="datetime" className="mb-2 block font-medium">
              Date & Time (ISO 8601)
            </label>
            <input
              id="datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              className="w-full rounded border border-gray-300 px-4 py-2"
              disabled={loading}
            />
            <p className="mt-1 text-sm text-gray-500">
              Example: 2025-04-21T18:30
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Generating...' : 'Generate Chapter'}
          </button>
        </form>

        {result && (
          <div className="rounded-lg bg-white p-6 shadow">
            {result.success ? (
              <>
                <div className="mb-4 flex items-center justify-between border-b pb-4">
                  <h2 className="text-xl font-bold">✅ Success</h2>
                  <span className="rounded bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                    {result.chapterId}
                  </span>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded bg-gray-50 p-3">
                    <p className="text-sm text-gray-600">Word Count</p>
                    <p className="text-xl font-bold">
                      {result.stats.wordCount}
                    </p>
                  </div>
                  <div className="rounded bg-gray-50 p-3">
                    <p className="text-sm text-gray-600">Characters</p>
                    <p className="text-xl font-bold">
                      {result.stats.charactersAdded}
                    </p>
                  </div>
                  <div className="rounded bg-gray-50 p-3">
                    <p className="text-sm text-gray-600">Places</p>
                    <p className="text-xl font-bold">
                      {result.stats.placesAdded}
                    </p>
                  </div>
                  <div className="rounded bg-gray-50 p-3">
                    <p className="text-sm text-gray-600">Time (ms)</p>
                    <p className="text-xl font-bold">
                      {result.stats.executionTime}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 font-bold">Generated Content:</h3>
                  <div className="whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm leading-relaxed">
                    {result.content}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <div className="mb-4 flex items-center gap-2 border-b pb-4">
                  <h2 className="text-xl font-bold text-red-600">❌ Error</h2>
                </div>
                <p className="rounded bg-red-50 p-4 text-red-800">
                  {result.error || 'Unknown error occurred'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
