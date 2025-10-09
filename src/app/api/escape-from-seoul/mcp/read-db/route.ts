import { client } from '@supabase-api/client.gen';
import {
  getEscapeFromSeoulCharacters,
  getEscapeFromSeoulEntries,
  getEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type { JSONSchema4 } from 'json-schema';
import { z } from 'zod';

import { ENV } from '@/env';
import { handleMcpRequest, type ToolDef } from '@/utils';

const configureSupabaseRest = () => {
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
};

const zUsagePhase = z.enum(['prewriting', 'drafting', 'revision']);
type UsagePhase = z.infer<typeof zUsagePhase>;

const zUsageContext = z.object({
  phase: zUsagePhase,
  purpose: z.string().min(1),
});

type UsageContext = z.infer<typeof zUsageContext>;

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

const ensureUsagePhase = (
  toolName: string,
  usage: UsageContext,
  allowed: UsagePhase[],
) => {
  if (allowed.includes(usage.phase)) return;

  throw new UsagePhaseError(
    `${toolName} 도구는 ${allowed.join(', ')} 단계에서만 호출할 수 있습니다.`,
  );
};

// zod schemas for safe arg parsing
const zListArgs = z.object({
  usage: zUsageContext,
  limit: z.number().int().min(1).max(100).optional(),
});
const zId = z.object({ usage: zUsageContext, id: z.uuid() });

const tools = [
  {
    name: 'entries.list',
    description:
      '작성된 일기 목록을 최신순(created_at 내림차순)으로 조회합니다. 이전 사건의 흐름, 등장한 캐릭터, 방문한 장소 등 스토리 연속성을 확인할 때 사용하세요. prewriting(사전조사) 또는 drafting(초안작성) 단계에서만 호출 가능합니다.',
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
    description:
      '특정 ID의 일기 내용을 상세 조회합니다. 이전 에피소드를 정확히 인용하거나 세부 묘사를 참조할 때 사용하세요. drafting(초안작성) 또는 revision(수정) 단계에서만 호출 가능합니다.',
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
    description:
      '등장인물 목록을 이름 오름차순으로 조회합니다. 캐릭터 구성을 파악하거나, 새 인물을 등장시키기 전 기존 인물과의 관계를 점검할 때 사용하세요. prewriting(사전조사) 또는 drafting(초안작성) 단계에서만 호출 가능합니다.',
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
    description:
      '특정 ID의 캐릭터 상세 정보를 조회합니다. 인물의 성격, 배경, 동기 등을 정확히 반영한 대사나 행동을 묘사할 때 사용하세요. drafting(초안작성) 또는 revision(수정) 단계에서만 호출 가능합니다.',
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
    description:
      '장소 목록을 이름 오름차순으로 조회합니다. 다음 장면의 배경을 선택하거나, 스토리 전개에 따라 이동 가능한 장소를 파악할 때 사용하세요. prewriting(사전조사) 단계에서만 호출 가능합니다.',
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
    description:
      '특정 ID의 장소 상세 정보를 조회합니다. 장소의 분위기, 구조, 특징 등을 정확히 묘사할 때 사용하세요. prewriting(사전조사) 또는 drafting(초안작성) 단계에서만 호출 가능합니다.',
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
] satisfies Array<ToolDef<unknown, unknown>>;

export async function POST(req: Request) {
  return handleMcpRequest({ req, tools, includeUsageInfo: true });
}
