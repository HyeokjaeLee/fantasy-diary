import { client } from '@supabase-api/client.gen';
import {
  getEscapeFromSeoulCharacters,
  getEscapeFromSeoulEntries,
  getEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type { JSONSchema4 } from 'json-schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ENV } from '@/env';
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

function configureSupabaseRest(): void {
  const url = (ENV.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const baseUrl = `${url}/rest/v1`;
  const serviceRole = ENV.NEXT_SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SERVICE_ROLE',
    );
  }
  client.setConfig({
    baseUrl,
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  });
}

interface ToolDef<TArgs, TResult> {
  name: string;
  description: string;
  usageGuidelines: string[];
  allowedPhases: UsagePhase[];
  inputSchema: JSONSchema4;
  handler: (args: TArgs) => Promise<TResult>;
}

const zUsagePhase = z.enum(['prewriting', 'drafting', 'revision']);
type UsagePhase = z.infer<typeof zUsagePhase>;

const zUsageContext = z.object({
  phase: zUsagePhase,
  purpose: z.string().min(1),
});
type UsageContext = z.infer<typeof zUsageContext>;
type JsonRpcRequest = z.infer<typeof zJsonRpcRequest>;

const usageJsonSchema: JSONSchema4 = {
  type: 'object',
  required: ['phase', 'purpose'],
  properties: {
    phase: { type: 'string', enum: ['prewriting', 'drafting', 'revision'] },
    purpose: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

class UsagePhaseError extends Error {}

function ensureUsagePhase(
  toolName: string,
  usage: UsageContext,
  allowed: UsagePhase[],
): void {
  if (allowed.includes(usage.phase)) {
    return;
  }

  throw new UsagePhaseError(
    `${toolName} 도구는 ${allowed.join(', ')} 단계에서만 호출할 수 있습니다.`,
  );
}

// zod schemas for safe arg parsing
const zListArgs = z.object({
  usage: zUsageContext,
  limit: z.number().int().min(1).max(100).optional(),
});
const zId = z.object({ usage: zUsageContext, id: z.string().uuid() });

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'entries.list',
    description: 'created_at 내림차순으로 일기 목록을 조회합니다.',
    usageGuidelines: [
      '새 장면을 시작하기 전에 최신 일기 흐름을 확인하려면 호출하세요.',
      '앞선 사건을 참조하지 않고 단락을 5개 이상 작성했다면 다시 호출해 일관성을 점검하세요.',
    ],
    allowedPhases: ['prewriting', 'drafting'],
    inputSchema: {
      type: 'object',
      required: ['usage'],
      properties: {
        usage: usageJsonSchema,
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { usage, limit = 50 } = zListArgs.parse(rawArgs ?? {});
      ensureUsagePhase('entries.list', usage, ['prewriting', 'drafting']);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEntries({
        headers: { Prefer: 'count=none' },
        query: { order: 'created_at.desc', limit: String(limit) },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'entries.get',
    description: '특정 ID에 해당하는 단일 일기를 조회합니다.',
    usageGuidelines: [
      '원문에서 특정 순간을 인용하거나 참조하려면 호출하세요.',
      '마지막 조회 후 30분 이상 지났다면 장면을 마무리하기 전에 다시 확인하세요.',
    ],
    allowedPhases: ['drafting', 'revision'],
    inputSchema: {
      type: 'object',
      required: ['usage', 'id'],
      properties: {
        usage: usageJsonSchema,
        id: { type: 'string', format: 'uuid' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { usage, id } = zId.parse(rawArgs);
      ensureUsagePhase('entries.get', usage, ['drafting', 'revision']);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEntries({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
  {
    name: 'characters.list',
    description: '이름 오름차순으로 등장인물 목록을 조회합니다.',
    usageGuidelines: [
      '플롯을 설계하거나 초안을 쓰면서 전체 캐릭터 구성을 다시 확인하고 싶을 때 호출하세요.',
      '새로운 조연을 등장시키기 직전에 한 번 더 호출해 균형을 맞춰 주세요.',
    ],
    allowedPhases: ['prewriting', 'drafting'],
    inputSchema: {
      type: 'object',
      required: ['usage'],
      properties: {
        usage: usageJsonSchema,
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { usage, limit = 50 } = zListArgs.parse(rawArgs ?? {});
      ensureUsagePhase('characters.list', usage, ['prewriting', 'drafting']);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulCharacters({
        headers: { Prefer: 'count=none' },
        query: { order: 'name.asc', limit: String(limit) },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'characters.get',
    description: '특정 ID에 해당하는 캐릭터 정보를 조회합니다.',
    usageGuidelines: [
      '해당 인물이 등장하는 대사나 내면 묘사를 쓰기 직전에 호출하세요.',
      '수정 단계에서 성격과 동기가 흔들리지 않는지 다시 확인할 때 사용하세요.',
    ],
    allowedPhases: ['drafting', 'revision'],
    inputSchema: {
      type: 'object',
      required: ['usage', 'id'],
      properties: {
        usage: usageJsonSchema,
        id: { type: 'string', format: 'uuid' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { usage, id } = zId.parse(rawArgs);
      ensureUsagePhase('characters.get', usage, ['drafting', 'revision']);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulCharacters({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
  {
    name: 'places.list',
    description: '이름 오름차순으로 장소 목록을 조회합니다.',
    usageGuidelines: [
      '다음 장면에 쓸 후보 장소를 조사할 때 호출하세요.',
      '이야기 배경이 새로운 막이나 지역으로 넘어가면 다시 호출해 주세요.',
    ],
    allowedPhases: ['prewriting'],
    inputSchema: {
      type: 'object',
      required: ['usage'],
      properties: {
        usage: usageJsonSchema,
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { usage, limit = 50 } = zListArgs.parse(rawArgs ?? {});
      ensureUsagePhase('places.list', usage, ['prewriting']);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulPlaces({
        headers: { Prefer: 'count=none' },
        query: { order: 'name.asc', limit: String(limit) },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'places.get',
    description: '특정 ID에 해당하는 장소 정보를 조회합니다.',
    usageGuidelines: [
      '장소 묘사를 쓰기 직전에 호출해 세부 묘사가 설정과 맞는지 확인하세요.',
      '같은 장소 안에서도 시선이 크게 움직이면 다시 호출해 맥락을 조정하세요.',
    ],
    allowedPhases: ['prewriting', 'drafting'],
    inputSchema: {
      type: 'object',
      required: ['usage', 'id'],
      properties: {
        usage: usageJsonSchema,
        id: { type: 'string', format: 'uuid' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { usage, id } = zId.parse(rawArgs);
      ensureUsagePhase('places.get', usage, ['prewriting', 'drafting']);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulPlaces({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
];

export async function POST(req: Request) {
  let body: JsonRpcRequest | null = null;

  try {
    const request = zJsonRpcRequest.parse(await req.json());
    body = request;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return NextResponse.json(fail(null, -32600, '잘못된 요청입니다.'), {
        status: 400,
      });
    }

    if (request.method === 'tools/list') {
      return NextResponse.json(
        ok(request.id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            usageGuidelines: t.usageGuidelines,
            allowedPhases: t.allowedPhases,
          })),
        }),
      );
    }

    if (request.method === 'tools/call') {
      const parsed = zCallToolParams.safeParse(request.params ?? {});
      if (!parsed.success || !parsed.data.name)
        return NextResponse.json(
          fail(request.id, -32602, '도구 이름이 없습니다.'),
          {
            status: 400,
          },
        );
      const tool = tools.find((t) => t.name === parsed.data.name);
      if (!tool)
        return NextResponse.json(
          fail(
            request.id,
            -32601,
            `알 수 없는 도구입니다: ${parsed.data.name}`,
          ),
          { status: 404 },
        );
      const result = await tool.handler(parsed.data.arguments ?? {});

      return NextResponse.json(
        ok(request.id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }),
      );
    }

    return NextResponse.json(
      fail(request.id, -32601, `알 수 없는 메서드입니다: ${request.method}`),
      { status: 404 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류입니다.';

    if (e instanceof UsagePhaseError) {
      return NextResponse.json(fail(body?.id ?? null, -32602, message), {
        status: 400,
      });
    }

    return NextResponse.json(fail(body?.id ?? null, -32000, message), {
      status: 500,
    });
  }
}
