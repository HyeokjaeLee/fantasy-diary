import { TRPCError } from '@trpc/server';
import { OpenAI } from 'openai';
import { z } from 'zod';

import { publicProcedure, router } from '@/configs/trpc/settings';
import { ENV } from '@/env';
import { runWithLock } from '@/server/lock';

// Minimal types for MCP JSON-RPC response envelopes
interface McpTextContent {
  type: 'text';
  text: string;
  [k: string]: unknown;
}
interface McpOk<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
}
interface McpCallResult {
  content: McpTextContent[];
  structuredContent?: unknown;
}

// Helper to build base URL from headers
function getBaseUrl(headers: Headers | null | undefined): string {
  const proto = headers?.get('x-forwarded-proto') ?? 'http';
  const host = headers?.get('host');

  if (host) return `${proto}://${host}`;

  // Fallback for local dev. Keep conservative default.
  return 'http://localhost:3000';
}

async function mcpCall<
  TArgs extends Record<string, unknown> | undefined,
  TResult = unknown,
>(
  baseUrl: string,
  segment: 'read' | 'write',
  name: string,
  args: TArgs,
): Promise<TResult> {
  const res = await fetch(`${baseUrl}/api/mcp/escape-from-seoul/${segment}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args ?? {} },
    }),
  });
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `MCP ${segment} call failed: ${res.status} ${res.statusText}${
        body ? ` - ${body}` : ''
      }`,
    });
  }
  const json = (await res.json()) as McpOk<McpCallResult>;
  const block = json.result?.content?.[0];
  if (!block || block.type !== 'text') {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid MCP result shape',
    });
  }
  try {
    return JSON.parse(block.text) as TResult;
  } catch {
    // Some tools may return primitives/strings; return as-is when not JSON
    return block.text as unknown as TResult;
  }
}

// OpenAI client
function createOpenAI() {
  return new OpenAI({ apiKey: ENV.NEXT_OPENAI_API_KEY });
}

const zGenerateInput = z.object({
  topic: z.string().default('Escape from Seoul'),
  style: z
    .enum(['리얼리즘', '드라마', '스릴러', '호러', '디스토피아', '느와르'])
    .default('호러'),
  length: z.enum(['짧은 글', '중편', '장편']).default('중편'),
  chapters: z.number().int().min(1).max(10).default(1),
  fallback: z.boolean().optional().default(false),
});

function takeSample<T>(arr: T[], n: number): T[] {
  if (!Array.isArray(arr)) return [];

  return arr.slice(0, Math.max(0, n));
}

function generateFallbackStory(params: {
  topic: string;
  style: string;
  length: string;
  chapters: number;
  characters: unknown[];
  places: unknown[];
  entries: unknown[];
}): string {
  const { topic, style, length, chapters, characters, places, entries } =
    params;
  const charNames = takeSample(characters, 5)
    .map((c: any) => c?.name)
    .filter((v: unknown): v is string => typeof v === 'string');
  const placeNames = takeSample(places, 5)
    .map((p: any) => p?.name)
    .filter((v: unknown): v is string => typeof v === 'string');
  const recent = takeSample(entries, 3)
    .map((e: any) => (typeof e?.content === 'string' ? e.content : ''))
    .filter((s) => s);

  const lines: string[] = [];
  lines.push(`# ${topic} — (백업 생성)`);
  lines.push('');
  lines.push(`장르: ${style} / 분량: ${length}`);
  lines.push('');
  for (let i = 1; i <= chapters; i++) {
    lines.push(`## Chapter ${i}`);
    lines.push('');
    lines.push(
      `도시는 침묵했지만, 먼 곳에서 퍼져오는 비명과 사이렌이 서울의 밤을 찢고 있었다. ` +
        `우리는 ${placeNames[0] ?? '한강 다리'} 근처에서 흩어진 식량과 약품을 추슬렀다.`,
    );
    lines.push(
      `좀비는 느리지만 끈질겼다. ${charNames[0] ?? '이준'}는 숨을 고르며 말했다. ` +
        '`지금 움직이면 살 수 있어. 멈추면 끝이야.`',
    );
    if (placeNames[1])
      lines.push(
        `다음 목적지는 ${placeNames[1]}였다. 지도보다 사람의 감이 더 믿을 만했다.`,
      );
    lines.push(
      `우리는 서로를 의심하지 않으려 애썼다. 인간의 갈등은 언제나 위기보다 가까웠다. ` +
        `재빨리 통로를 지나며 ${charNames[1] ?? '민서'}가 뒤를 지켰다.`,
    );
    if (recent[0]) lines.push(`지난 기록: ${recent[0].slice(0, 140)}...`);
    lines.push('');
  }

  return lines.join('\n');
}

export const story = router({
  generate: publicProcedure
    .input(zGenerateInput)
    .mutation(async ({ ctx, input }) => {
      const baseUrl = getBaseUrl(ctx.headers);

      // Use MCP read tools to ground the world model
      const [characters, places, recentEntries] = await Promise.all([
        mcpCall<{ limit?: number }, unknown[]>(
          baseUrl,
          'read',
          'characters.list',
          { limit: 50 },
        ),
        mcpCall<{ limit?: number }, unknown[]>(baseUrl, 'read', 'places.list', {
          limit: 50,
        }),
        mcpCall<{ limit?: number }, unknown[]>(
          baseUrl,
          'read',
          'entries.list',
          { limit: 10 },
        ),
      ]);

      const client = createOpenAI();

      const lockName = 'trpc:story:generate';
      const run = async () => {
        const system = [
          '너는 세계관 작가이자 스토리 디자이너야.',
          '세계관: 좀비가 창궐한 서울. 생존, 인간 군상, 도시 지리, 긴장감이 핵심.',
          '언어: 반드시 한국어로만 작성.',
          '톤 & 스타일: 영화적 묘사 + 감각적 디테일. 과장 금지, 리얼리즘 기반.',
          '출력 형식: 마크다운. 제목, 장 구분, 단락 구성을 명확히.',
        ].join('\n');

        const worldContext = [
          `등장인물 샘플: ${JSON.stringify(characters).slice(0, 2000)}`,
          `장소 샘플: ${JSON.stringify(places).slice(0, 2000)}`,
          `최근 기록 샘플: ${JSON.stringify(recentEntries).slice(0, 2000)}`,
        ].join('\n');

        const user = [
          `주제: ${input.topic} (장르: ${input.style})`,
          `분량: ${input.length}, 장 수: ${input.chapters}`,
          '요구사항:',
          '- 서울의 실제 지명/지형, 대중교통, 건물 구조 등이 드러나야 함',
          '- 좀비의 위협과 인간 간 갈등이 교차하며 서사가 진행될 것',
          '- 장마다 서사의 목적이 분명하고, 각 장의 미니클라이맥스가 존재할 것',
          '- 클리셰 남용 금지, 인물의 선택과 결과가 설득력 있게 연결될 것',
          '- 반드시 한국어. 반말/명령문 금지. 문학적 완성도를 지향',
          '',
          '아래 세계관 데이터를 참고하여 세계관과 연속성, 디테일을 보강해.',
          worldContext,
          '',
          '출력:',
          `- 제목 (H1)`,
          `- ${input.chapters}개 장(Chapter)로 구성. 각 장은 H2로 시작`,
          '- 각 장은 6~12문단 내외로 구성',
        ].join('\n');

        let text = '';
        let fallbackUsed = false;
        let openAIError: string | undefined;

        if (input.fallback) {
          fallbackUsed = true;
          text = generateFallbackStory({
            topic: input.topic,
            style: input.style,
            length: input.length,
            chapters: input.chapters,
            characters,
            places,
            entries: recentEntries,
          });
        } else {
          try {
            const completion = await client.chat.completions.create({
              model: 'gpt-4o-mini',
              temperature: 0.9,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            });
            text = completion.choices[0]?.message?.content ?? '';
            if (!text) throw new Error('Empty completion');
          } catch (err) {
            openAIError = err instanceof Error ? err.message : String(err);
            // Fallback to local generator
            fallbackUsed = true;
            text = generateFallbackStory({
              topic: input.topic,
              style: input.style,
              length: input.length,
              chapters: input.chapters,
              characters,
              places,
              entries: recentEntries,
            });
          }
        }

        // Save via MCP write tool (entries.create)
        const saved = await mcpCall<{ content: string }, unknown>(
          baseUrl,
          'write',
          'entries.create',
          {
            content: text,
          },
        );

        return {
          ok: true as const,
          content: text,
          saved,
          fallbackUsed,
          openAIError,
        };
      };

      const res = await runWithLock(lockName, run, {
        ttlMs: 60_000,
        heartbeatMs: 10_000,
      });
      if (!res.ok) {
        if (res.reason === 'busy') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'story.generate already running',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: res.reason ?? 'unknown error',
        });
      }

      return res.value;
    }),
});
