import { client } from '@supabase-api/client.gen';
import {
  deleteEscapeFromSeoulCharacters,
  deleteEscapeFromSeoulEpisodes,
  deleteEscapeFromSeoulPlaces,
  patchEscapeFromSeoulCharacters,
  patchEscapeFromSeoulEpisodes,
  patchEscapeFromSeoulPlaces,
  postEscapeFromSeoulCharacters,
  postEscapeFromSeoulEpisodes,
  postEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEpisodes,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
import {
  zEscapeFromSeoulCharacters,
  zEscapeFromSeoulPlaces,
} from '@supabase-api/zod.gen';
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

const normalizeString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : fallback;
  }

  return fallback;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length > 0) {
      deduped.add(trimmed);
    }
  }

  return Array.from(deduped);
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const stripUndefined = <T extends Record<string, unknown>>(
  input: T,
): Partial<T> => {
  const entries = Object.entries(input).filter(([, val]) => val !== undefined);

  return Object.fromEntries(entries) as Partial<T>;
};

const zEpisodesCreate = z
  .object({
    id: z.string().min(1),
    content: z.string().min(1),
    summary: z.string().optional(),
    characters: z.array(z.string()).optional(),
    places: z.array(z.string()).optional(),
  })
  .passthrough();

const zEpisodesUpdate = z
  .object({
    id: z.string().min(1),
    content: z.string().optional(),
    summary: z.string().optional(),
    characters: z.array(z.string()).optional(),
    places: z.array(z.string()).optional(),
  })
  .passthrough();

const zEpisodesDelete = z.object({
  id: z.string().min(1),
});

const zCharactersCreate = zEscapeFromSeoulCharacters
  .partial()
  .extend({
    name: zEscapeFromSeoulCharacters.shape.name,
  })
  .passthrough();

const zCharactersUpdate = zEscapeFromSeoulCharacters
  .partial()
  .extend({
    name: zEscapeFromSeoulCharacters.shape.name,
  })
  .passthrough();

const zCharactersDelete = z.object({
  name: zEscapeFromSeoulCharacters.shape.name,
});

const zPlacesCreate = zEscapeFromSeoulPlaces
  .partial()
  .extend({
    name: zEscapeFromSeoulPlaces.shape.name,
  })
  .passthrough();

const zPlacesUpdate = zEscapeFromSeoulPlaces
  .partial()
  .extend({
    name: zEscapeFromSeoulPlaces.shape.name,
  })
  .passthrough();

const zPlacesDelete = z.object({
  name: zEscapeFromSeoulPlaces.shape.name,
});

const buildEpisodeCreate = (
  input: z.infer<typeof zEpisodesCreate>,
): EscapeFromSeoulEpisodes => {
  const summary = normalizeString(input.summary, '');

  return {
    id: input.id,
    content: input.content,
    summary: summary.length > 0 ? summary : undefined,
    characters: toStringArray(input.characters),
    places: toStringArray(input.places),
  };
};

const buildEpisodeUpdate = (
  input: z.infer<typeof zEpisodesUpdate>,
): Partial<EscapeFromSeoulEpisodes> => {
  const payload: Partial<EscapeFromSeoulEpisodes> = {};
  if (typeof input.content === 'string') {
    payload.content = input.content;
  }
  if (input.summary !== undefined) {
    const summary = normalizeString(input.summary, '');
    payload.summary = summary.length > 0 ? summary : undefined;
  }
  if (input.characters !== undefined) {
    payload.characters = toStringArray(input.characters);
  }
  if (input.places !== undefined) {
    payload.places = toStringArray(input.places);
  }

  return stripUndefined(payload);
};

const buildCharacterCreate = (
  input: z.infer<typeof zCharactersCreate>,
): EscapeFromSeoulCharacters => {
  const nowIso = new Date().toISOString();
  const majorEvents = toStringArray(input.major_events);
  const characterTraits = toStringArray(input.character_traits);

  return {
    name: input.name.trim(),
    personality: normalizeString(input.personality),
    background: normalizeString(input.background),
    appearance: normalizeString(input.appearance),
    current_place: normalizeString(input.current_place, 'unknown'),
    relationships: input.relationships !== undefined ? input.relationships : [],
    major_events: majorEvents,
    character_traits: characterTraits,
    current_status: normalizeString(input.current_status),
    updated_at: input.updated_at ?? nowIso,
    last_mentioned_episode_id: normalizeString(input.last_mentioned_episode_id),
  };
};

const buildCharacterUpdate = (
  input: z.infer<typeof zCharactersUpdate>,
): Partial<EscapeFromSeoulCharacters> => {
  const payload: Partial<EscapeFromSeoulCharacters> = {};
  if (input.personality !== undefined) {
    payload.personality = normalizeString(input.personality);
  }
  if (input.background !== undefined) {
    payload.background = normalizeString(input.background);
  }
  if (input.appearance !== undefined) {
    payload.appearance = normalizeString(input.appearance);
  }
  if (input.current_place !== undefined) {
    payload.current_place = normalizeString(input.current_place, 'unknown');
  }
  if (input.relationships !== undefined) {
    payload.relationships = input.relationships;
  }
  if (input.major_events !== undefined) {
    payload.major_events = toStringArray(input.major_events);
  }
  if (input.character_traits !== undefined) {
    payload.character_traits = toStringArray(input.character_traits);
  }
  if (input.current_status !== undefined) {
    payload.current_status = normalizeString(input.current_status);
  }
  if (input.updated_at !== undefined) {
    payload.updated_at = input.updated_at;
  } else if (Object.keys(payload).length > 0) {
    payload.updated_at = new Date().toISOString();
  }
  if (input.last_mentioned_episode_id !== undefined) {
    payload.last_mentioned_episode_id = normalizeString(
      input.last_mentioned_episode_id,
    );
  }

  return stripUndefined(payload);
};

const buildPlaceCreate = (
  input: z.infer<typeof zPlacesCreate>,
): EscapeFromSeoulPlaces => {
  const nowIso = new Date().toISOString();
  const latitude = toNumber(input.latitude) ?? 0;
  const longitude = toNumber(input.longitude) ?? 0;

  return {
    name: input.name.trim(),
    current_situation: normalizeString(input.current_situation),
    latitude,
    longitude,
    last_weather_condition: normalizeString(input.last_weather_condition),
    last_weather_weather_condition: normalizeString(
      input.last_weather_weather_condition,
    ),
    updated_at: input.updated_at ?? nowIso,
    last_mentioned_episode_id: normalizeString(input.last_mentioned_episode_id),
  };
};

const buildPlaceUpdate = (
  input: z.infer<typeof zPlacesUpdate>,
): Partial<EscapeFromSeoulPlaces> => {
  const payload: Partial<EscapeFromSeoulPlaces> = {};
  if (input.current_situation !== undefined) {
    payload.current_situation = normalizeString(input.current_situation);
  }
  if (input.latitude !== undefined) {
    payload.latitude = toNumber(input.latitude) ?? 0;
  }
  if (input.longitude !== undefined) {
    payload.longitude = toNumber(input.longitude) ?? 0;
  }
  if (input.last_weather_condition !== undefined) {
    payload.last_weather_condition = normalizeString(
      input.last_weather_condition,
    );
  }
  if (input.last_weather_weather_condition !== undefined) {
    payload.last_weather_weather_condition = normalizeString(
      input.last_weather_weather_condition,
    );
  }
  if (input.updated_at !== undefined) {
    payload.updated_at = input.updated_at;
  } else if (Object.keys(payload).length > 0) {
    payload.updated_at = new Date().toISOString();
  }
  if (input.last_mentioned_episode_id !== undefined) {
    payload.last_mentioned_episode_id = normalizeString(
      input.last_mentioned_episode_id,
    );
  }

  return stripUndefined(payload);
};

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'episodes.create',
    description:
      '새로운 에피소드를 생성합니다. 작성한 본문과 요약, 등장한 캐릭터·장소 목록을 저장할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id', 'content'],
      properties: {
        id: {
          type: 'string',
          description: '에피소드 ID (예: YYYYMMDDHHmm 형태)',
        },
        content: {
          type: 'string',
          description: '에피소드 본문 (마크다운 허용)',
        },
        summary: {
          type: 'string',
          description: '간단한 요약 (선택 사항)',
        },
        characters: {
          type: 'array',
          description: '에피소드에 등장한 캐릭터 이름 목록',
          items: { type: 'string' },
        },
        places: {
          type: 'array',
          description: '에피소드에 등장한 장소 이름 목록',
          items: { type: 'string' },
        },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zEpisodesCreate.parse(raw);
      const body = buildEpisodeCreate(parsed);
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulEpisodes({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'episodes.update',
    description:
      '기존 에피소드를 수정합니다. 본문, 요약 또는 등장 인물/장소 목록을 업데이트할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: '수정할 에피소드 ID' },
        content: { type: 'string', description: '새로운 본문 (선택 사항)' },
        summary: { type: 'string', description: '새로운 요약 (선택 사항)' },
        characters: {
          type: 'array',
          items: { type: 'string' },
          description: '최신 캐릭터 목록 (선택 사항)',
        },
        places: {
          type: 'array',
          items: { type: 'string' },
          description: '최신 장소 목록 (선택 사항)',
        },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zEpisodesUpdate.parse(rawArgs);
      const body = buildEpisodeUpdate(parsed);
      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const payload = {
        id: parsed.id,
        ...body,
      } satisfies Partial<EscapeFromSeoulEpisodes> & { id: string };
      const { error } = await patchEscapeFromSeoulEpisodes({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${parsed.id}` },
        body: payload as EscapeFromSeoulEpisodes,
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'episodes.delete',
    description:
      '에피소드를 삭제합니다. 잘못 생성되었거나 더 이상 필요하지 않은 에피소드를 제거할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: '삭제할 에피소드 ID' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zEpisodesDelete.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulEpisodes({
        query: { id: `eq.${parsed.id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'characters.create',
    description:
      '새로운 캐릭터를 생성합니다. 이름과 기본 프로필, 현재 위치 등을 저장할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '캐릭터 이름' },
        current_place: {
          type: 'string',
          description: '현재 위치 (escape_from_seoul_places.name 참조)',
        },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zCharactersCreate.parse(raw);
      const body = buildCharacterCreate(parsed);
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
      '기존 캐릭터 정보를 수정합니다. 성격, 현재 위치, 최신 사건 등을 갱신할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '수정할 캐릭터 이름' },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zCharactersUpdate.parse(rawArgs);
      const body = buildCharacterUpdate(parsed);
      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const payload = {
        name: parsed.name,
        ...body,
      } satisfies Partial<EscapeFromSeoulCharacters> & { name: string };
      const { error } = await patchEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=minimal' },
        query: { name: `eq.${parsed.name}` },
        body: payload as EscapeFromSeoulCharacters,
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'characters.delete',
    description:
      '캐릭터를 삭제합니다. 더 이상 스토리에 등장하지 않거나 중복된 기록을 정리할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '삭제할 캐릭터 이름' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zCharactersDelete.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulCharacters({
        query: { name: `eq.${parsed.name}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'places.create',
    description:
      '새로운 장소를 생성합니다. 배경이 되는 위치와 관련 정보를 등록할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '장소 이름' },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zPlacesCreate.parse(raw);
      const body = buildPlaceCreate(parsed);
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
      '기존 장소 정보를 수정합니다. 묘사, 좌표, 최신 상황 등을 업데이트할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '수정할 장소 이름' },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zPlacesUpdate.parse(rawArgs);
      const body = buildPlaceUpdate(parsed);
      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const payload = {
        name: parsed.name,
        ...body,
      } satisfies Partial<EscapeFromSeoulPlaces> & { name: string };
      const { error } = await patchEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=minimal' },
        query: { name: `eq.${parsed.name}` },
        body: payload as EscapeFromSeoulPlaces,
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
  {
    name: 'places.delete',
    description:
      '장소를 삭제합니다. 더 이상 필요하지 않거나 잘못된 장소를 정리할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: '삭제할 장소 이름' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zPlacesDelete.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulPlaces({
        query: { name: `eq.${parsed.name}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
];

export async function POST(req: Request) {
  return handleMcpRequest({ req, tools });
}
