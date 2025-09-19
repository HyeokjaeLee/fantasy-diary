import React from 'react';

import { fetchKmaUltraSrtNcst } from '@/app/api/external/kma';

type Sp = Record<string, string | string[] | undefined>;

export const dynamic = 'force-dynamic';

function toInt(value: string | string[] | undefined, fallback: number): number {
  if (typeof value === 'string') {
    const n = Number(value);

    return Number.isInteger(n) ? n : fallback;
  }

  return fallback;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Sp>;
}) {
  const sp = await searchParams;
  const gridX = toInt(sp.gridX, 55);
  const gridY = toInt(sp.gridY, 127);
  const baseDate = typeof sp.baseDate === 'string' ? sp.baseDate : '';
  const baseTime = typeof sp.baseTime === 'string' ? sp.baseTime : '';
  const pageNumber = toInt(sp.pageNumber, 1);
  const numberOfRows = toInt(sp.numberOfRows, 1000);

  const shouldFetch = typeof sp.submit !== 'undefined';

  let result: Awaited<ReturnType<typeof fetchKmaUltraSrtNcst>> | null = null;
  let error: string | null = null;

  if (shouldFetch) {
    try {
      result = await fetchKmaUltraSrtNcst({
        gridX,
        gridY,
        baseDate: baseDate || undefined,
        baseTime: baseTime || undefined,
        pageNumber,
        numberOfRows,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    }
  }

  return (
    <main style={{ maxWidth: 880, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>KMA 초단기실황 테스트</h1>

      <form method="GET" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>gridX (nx)</span>
            <input
              name="gridX"
              defaultValue={gridX}
              type="number"
              min={1}
              step={1}
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>gridY (ny)</span>
            <input
              name="gridY"
              defaultValue={gridY}
              type="number"
              min={1}
              step={1}
              required
            />
          </label>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>baseDate (YYYYMMDD, 선택)</span>
            <input
              name="baseDate"
              defaultValue={baseDate}
              placeholder="예: 20250920"
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>baseTime (HHmm, 선택)</span>
            <input
              name="baseTime"
              defaultValue={baseTime}
              placeholder="예: 0500"
            />
          </label>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span>pageNumber</span>
            <input
              name="pageNumber"
              defaultValue={pageNumber}
              type="number"
              min={1}
              step={1}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>numberOfRows</span>
            <input
              name="numberOfRows"
              defaultValue={numberOfRows}
              type="number"
              min={1}
              step={1}
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            name="submit"
            value="1"
            style={{ padding: '8px 12px' }}
          >
            조회하기
          </button>
        </div>
      </form>

      <section style={{ marginTop: 24 }}>
        {error && (
          <div style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>
            Error: {error}
          </div>
        )}
        {!error && result && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <strong>요청 URL</strong>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  wordBreak: 'break-all',
                }}
              >
                {result.url}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <strong>기준시각</strong>
                <div>
                  {result.baseDate} / {result.baseTime}
                </div>
              </div>
              <div>
                <strong>격자좌표</strong>
                <div>
                  nx={result.nx}, ny={result.ny}
                </div>
              </div>
            </div>
            <div>
              <strong>헤더</strong>
              <pre
                style={{
                  background: '#111',
                  color: '#eee',
                  padding: 12,
                  borderRadius: 6,
                }}
              >
                {JSON.stringify(result.header, null, 2)}
              </pre>
            </div>
            <div>
              <strong>items ({result.items.length})</strong>
              <pre
                style={{
                  background: '#111',
                  color: '#eee',
                  padding: 12,
                  borderRadius: 6,
                  maxHeight: 440,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(result.items, null, 2)}
              </pre>
            </div>
            <div>
              <strong>raw</strong>
              <pre
                style={{
                  background: '#111',
                  color: '#eee',
                  padding: 12,
                  borderRadius: 6,
                  maxHeight: 440,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
