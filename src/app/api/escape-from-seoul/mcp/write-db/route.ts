import { randomUUID } from 'node:crypto';

import { client } from '@supabase-api/client.gen';
import {
  deleteEscapeFromSeoulCharacters,
  deleteEscapeFromSeoulEntries,
  deleteEscapeFromSeoulPlaces,
  patchEscapeFromSeoulCharacters,
  patchEscapeFromSeoulEntries,
  patchEscapeFromSeoulPlaces,
  postEscapeFromSeoulCharacters,
  postEscapeFromSeoulEntries,
  postEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEntries,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
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

// zod schemas for safe parsing (avoid type assertions) for tool arguments

const zId = z.object({ id: z.string().uuid() });

// Entries
const zEntriesCreate = z
  .object({
    content: z.string(),
    id: z.string().uuid().optional(),
    created_at: z.string().datetime().optional(),
    summary: z.string().optional(),
    weather_condition: z.string().optional(),
    weather_temperature: z.number().optional(),
    location: z.string().optional(),
    mood: z.string().optional(),
    major_events: z.array(z.string()).optional(),
    appeared_characters: z.array(z.string()).optional(),
    emotional_tone: z.string().optional(),
    story_tags: z.array(z.string()).optional(),
    previous_context: z.string().optional(),
    next_context_hints: z.string().optional(),
  })
  .passthrough();

const zEntriesUpdate = z
  .object({
    id: z.string().uuid(),
    content: z.string().optional(),
    created_at: z.string().datetime().optional(),
    summary: z.string().optional(),
    weather_condition: z.string().optional(),
    weather_temperature: z.number().optional(),
    location: z.string().optional(),
    mood: z.string().optional(),
    major_events: z.array(z.string()).optional(),
    appeared_characters: z.array(z.string()).optional(),
    emotional_tone: z.string().optional(),
    story_tags: z.array(z.string()).optional(),
    previous_context: z.string().optional(),
    next_context_hints: z.string().optional(),
  })
  .passthrough();

// Characters
const zCharactersCreate = z
  .object({
    name: z.string(),
    id: z.string().uuid().optional(),
    personality: z.string().optional(),
    background: z.string().optional(),
    appearance: z.string().optional(),
    current_location: z.string().optional(),
    relationships: z.unknown().optional(),
    major_events: z.array(z.string()).optional(),
    character_traits: z.array(z.string()).optional(),
    current_status: z.string().optional(),
    first_appeared_at: z.string().datetime().optional(),
    last_updated: z.string().datetime().optional(),
  })
  .passthrough();

const zCharactersUpdate = z
  .object({
    id: z.string().uuid(),
    name: z.string().optional(),
    personality: z.string().optional(),
    background: z.string().optional(),
    appearance: z.string().optional(),
    current_location: z.string().optional(),
    relationships: z.unknown().optional(),
    major_events: z.array(z.string()).optional(),
    character_traits: z.array(z.string()).optional(),
    current_status: z.string().optional(),
    first_appeared_at: z.string().datetime().optional(),
    last_updated: z.string().datetime().optional(),
  })
  .passthrough();

// Places
const zPlacesCreate = z
  .object({
    name: z.string(),
    id: z.string().uuid().optional(),
    current_situation: z.string().optional(),
  })
  .passthrough();

const zPlacesUpdate = z
  .object({
    id: z.string().uuid(),
    name: z.string().optional(),
    current_situation: z.string().optional(),
  })
  .passthrough();

const toStringArray = (value: unknown, fallback: string[] = []): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? item : String(item),
    );
  }

  return fallback;
};

const stripUndefined = <T extends Record<string, unknown>>(
  value: T,
): Partial<T> => {
  const entries = Object.entries(value).filter(([, val]) => val !== undefined);

  return Object.fromEntries(entries) as Partial<T>;
};

const withEntryDefaults = (
  parsed: z.infer<typeof zEntriesCreate>,
): EscapeFromSeoulEntries => {
  const nowIso = new Date().toISOString();

  return {
    id: parsed.id ?? randomUUID(),
    created_at: parsed.created_at ?? nowIso,
    content: parsed.content,
    summary: parsed.summary ?? '',
    weather_condition: parsed.weather_condition ?? '',
    weather_temperature: parsed.weather_temperature ?? 0,
    location: parsed.location ?? '',
    mood: parsed.mood ?? '',
    major_events: toStringArray(parsed.major_events),
    appeared_characters: toStringArray(parsed.appeared_characters),
    emotional_tone: parsed.emotional_tone ?? '',
    story_tags: toStringArray(parsed.story_tags),
    previous_context: parsed.previous_context ?? '',
    next_context_hints: parsed.next_context_hints ?? '',
  };
};

const withCharacterDefaults = (
  parsed: z.infer<typeof zCharactersCreate>,
): EscapeFromSeoulCharacters => {
  const nowIso = new Date().toISOString();

  return {
    id: parsed.id ?? randomUUID(),
    name: parsed.name.trim(),
    personality: parsed.personality ?? '',
    background: parsed.background ?? '',
    appearance: parsed.appearance ?? '',
    current_location: parsed.current_location ?? '',
    relationships: parsed.relationships ?? [],
    major_events: toStringArray(parsed.major_events),
    character_traits: toStringArray(parsed.character_traits),
    current_status: parsed.current_status ?? '',
    first_appeared_at: parsed.first_appeared_at ?? nowIso,
    last_updated: parsed.last_updated ?? nowIso,
  };
};

const withPlaceDefaults = (
  parsed: z.infer<typeof zPlacesCreate>,
): EscapeFromSeoulPlaces => ({
  id: parsed.id ?? randomUUID(),
  name: parsed.name.trim(),
  current_situation: parsed.current_situation ?? '',
});

const tools: Array<ToolDef<unknown, unknown>> = [
  // entries.*
  {
    name: 'entries.create',
    description:
      '새로운 일기를 생성합니다. 작성한 스토리 텍스트를 DB에 저장할 때 사용하세요. content 필드에 마크다운 형식의 본문을 포함해야 합니다.',
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', description: '일기 본문 (마크다운 형식)' },
        id: { type: 'string', format: 'uuid', description: '선택적 UUID' },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zEntriesCreate.parse(raw);
      const body = withEntryDefaults(parsed);
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulEntries({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'entries.update',
    description:
      '기존 일기를 수정합니다. 특정 ID의 일기 내용을 업데이트할 때 사용하세요. content 외에도 다른 필드를 함께 수정할 수 있습니다.',
    inputSchema: {
      type: 'object',
      required: ['id', 'content'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '수정할 일기의 ID' },
        content: {
          type: 'string',
          description: '수정할 일기 본문 (마크다운 형식)',
        },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const payload = zEntriesUpdate.parse(rawArgs);
      const { id, ...rest } = payload;
      const body = stripUndefined(rest);
      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulEntries({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: { id, ...body } as unknown as EscapeFromSeoulEntries,
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'entries.delete',
    description:
      '일기를 삭제합니다. 잘못 생성되었거나 더 이상 필요하지 않은 일기를 제거할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '삭제할 일기의 ID' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zId.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulEntries({
        query: { id: `eq.${id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },

  // characters.*
  {
    name: 'characters.create',
    description:
      '새로운 캐릭터를 생성합니다. 스토리에 등장할 인물의 이름, 성격, 배경 등을 저장할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '캐릭터 이름' },
        id: { type: 'string', format: 'uuid', description: '선택적 UUID' },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zCharactersCreate.parse(raw);
      const body = withCharacterDefaults(parsed);
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'characters.update',
    description:
      '기존 캐릭터 정보를 수정합니다. 캐릭터의 설정이나 속성을 업데이트할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: '수정할 캐릭터의 ID',
        },
        name: { type: 'string', description: '캐릭터 이름' },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const payload = zCharactersUpdate.parse(rawArgs);
      const { id, ...rest } = payload;
      const base = stripUndefined(rest);
      if (Object.keys(base).length === 0) {
        return { ok: true };
      }
      const bodyWithTimestamps =
        base.last_updated !== undefined
          ? base
          : {
              ...base,
              last_updated: new Date().toISOString(),
            };
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: {
          id,
          ...bodyWithTimestamps,
        } as unknown as EscapeFromSeoulCharacters,
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'characters.delete',
    description:
      '캐릭터를 삭제합니다. 더 이상 스토리에 등장하지 않거나 불필요한 캐릭터를 제거할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: '삭제할 캐릭터의 ID',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zId.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulCharacters({
        query: { id: `eq.${id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },

  // places.*
  {
    name: 'places.create',
    description:
      '새로운 장소를 생성합니다. 스토리의 배경이 될 위치의 이름, 특징, 분위기 등을 저장할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '장소 이름' },
        id: { type: 'string', format: 'uuid', description: '선택적 UUID' },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zPlacesCreate.parse(raw);
      const body = withPlaceDefaults(parsed);
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'places.update',
    description:
      '기존 장소 정보를 수정합니다. 장소의 설정이나 속성을 업데이트할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: '수정할 장소의 ID',
        },
        name: { type: 'string', description: '장소 이름' },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const payload = zPlacesUpdate.parse(rawArgs);
      const { id, ...rest } = payload;
      const body = stripUndefined(rest);
      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: { id, ...body } as unknown as EscapeFromSeoulPlaces,
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'places.delete',
    description:
      '장소를 삭제합니다. 더 이상 스토리에 사용되지 않거나 불필요한 장소를 제거할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '삭제할 장소의 ID' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zId.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulPlaces({
        query: { id: `eq.${id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
];

export async function POST(req: Request) {
  return handleMcpRequest({ req, tools });
}
