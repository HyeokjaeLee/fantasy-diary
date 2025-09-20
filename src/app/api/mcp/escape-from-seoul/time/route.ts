import type { JSONSchema4 } from 'json-schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  type JsonRpcFailure,
  type JsonRpcId,
  type JsonRpcSuccess,
  zCallToolParams,
  zJsonRpcRequest,
} from '@/types/mcp';

export const runtime = 'edge';

function ok<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: '2.0', id, result };
}

function fail(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

const TIME_API_URL = 'https://timeapi.io/api/TimeZone/zone?timeZone=Asia/Seoul';

const zTimeApiOffset = z
  .object({
    seconds: z.number(),
    milliseconds: z.number(),
    hours: z.number(),
    minutes: z.number(),
  })
  .passthrough();

const zTimeApiResponse = z
  .object({
    timeZone: z.string(),
    currentLocalTime: z.string(),
    currentUtcOffset: zTimeApiOffset,
    timeZoneAbbreviation: z.string().nullable().optional(),
  })
  .passthrough();

const zSeoulTimeResult = z.object({
  timezone: z.string(),
  iso: z.string(),
  unixSeconds: z.number(),
  utcOffset: z.string(),
  abbreviation: z.string().nullable(),
  formatted: z.string(),
  components: z.object({
    date: z.string(),
    time: z.string(),
  }),
  source: z.object({ api: z.string() }),
});

type SeoulTimeResult = z.infer<typeof zSeoulTimeResult>;

interface ToolDef<TArgs, TResult> {
  name: string;
  description: string;
  inputSchema: JSONSchema4;
  handler: (args: TArgs) => Promise<TResult>;
}

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'time.seoulNow',
    description: 'Get the current date and time for the Asia/Seoul timezone.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => {
      const res = await fetch(TIME_API_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`timeapi.io request failed with HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('json')) {
        const preview = (await res.text()).slice(0, 200);
        throw new Error(
          `timeapi.io responded with non-JSON payload (content-type: ${contentType}): ${preview}`,
        );
      }

      const parsed = zTimeApiResponse.parse(await res.json());
      const offsetSeconds = parsed.currentUtcOffset.seconds;
      const sign = offsetSeconds >= 0 ? '+' : '-';
      const absSeconds = Math.abs(offsetSeconds);
      const offsetHours = Math.floor(absSeconds / 3600);
      const offsetMinutes = Math.floor((absSeconds % 3600) / 60);
      const offset = `${sign}${String(offsetHours).padStart(2, '0')}:${String(
        offsetMinutes,
      ).padStart(2, '0')}`;

      const isoWithOffset = `${parsed.currentLocalTime}${offset}`;
      const seoulDate = new Date(isoWithOffset);
      if (Number.isNaN(seoulDate.getTime())) {
        throw new Error('Invalid datetime received from timeapi.io');
      }

      const timeZone = 'Asia/Seoul';
      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const displayFormatter = new Intl.DateTimeFormat('ko-KR', {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'medium',
      });

      const result: SeoulTimeResult = zSeoulTimeResult.parse({
        timezone: parsed.timeZone,
        iso: isoWithOffset,
        unixSeconds: Math.floor(seoulDate.getTime() / 1000),
        utcOffset: offset,
        abbreviation: parsed.timeZoneAbbreviation ?? null,
        formatted: displayFormatter.format(seoulDate),
        components: {
          date: dateFormatter.format(seoulDate),
          time: timeFormatter.format(seoulDate),
        },
        source: { api: TIME_API_URL },
      });

      return result;
    },
  },
];

export async function POST(req: Request) {
  try {
    const body = zJsonRpcRequest.parse(await req.json());
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return NextResponse.json(fail(null, -32600, 'Invalid Request'), {
        status: 400,
      });
    }

    if (body.method === 'tools/list') {
      return NextResponse.json(
        ok(body.id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        }),
      );
    }

    if (body.method === 'tools/call') {
      const parsed = zCallToolParams.safeParse(body.params ?? {});
      if (!parsed.success || !parsed.data.name) {
        return NextResponse.json(fail(body.id, -32602, 'Missing tool name'), {
          status: 400,
        });
      }

      const tool = tools.find((t) => t.name === parsed.data.name);
      if (!tool) {
        return NextResponse.json(
          fail(body.id, -32601, `Unknown tool: ${parsed.data.name}`),
          { status: 404 },
        );
      }

      const result = await tool.handler(parsed.data.arguments ?? {});

      return NextResponse.json(
        ok(body.id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }),
      );
    }

    return NextResponse.json(
      fail(body.id, -32601, `Unknown method: ${body.method}`),
      { status: 404 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(fail(null, -32000, message), { status: 500 });
  }
}
