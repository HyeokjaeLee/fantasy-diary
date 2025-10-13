import { client } from '@supabase-api/client.gen';
import {
  patchEscapeFromSeoulCharacters,
  patchEscapeFromSeoulPlaces,
  postEscapeFromSeoulCharacters,
  postEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEpisodes,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
import {
  zEscapeFromSeoulCharacters,
  zEscapeFromSeoulEpisodes,
  zEscapeFromSeoulPlaces,
} from '@supabase-api/zod.gen';
import type { z } from 'zod';

import { ENV } from '@/env';
import type { Tool } from '@/types/mcp';
import { handleMcpRequest } from '@/utils';

import { episodeTools } from './_libs/episodeTools';

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

const zCharactersUpdate = zEscapeFromSeoulCharacters.partial();

const zPlacesUpdate = zEscapeFromSeoulPlaces
  .partial()
  .extend({
    name: zEscapeFromSeoulPlaces.shape.name,
  })
  .passthrough();

const buildCharacterCreate = (
  input: z.infer<typeof zEscapeFromSeoulCharacters>,
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
  input: z.infer<typeof zEscapeFromSeoulPlaces>,
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

const tools: Tool[] = [
  ...episodeTools,
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
      const parsed = zEscapeFromSeoulCharacters.parse(raw);
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
      const parsed = zEscapeFromSeoulPlaces.parse(raw);
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
];

export async function POST(req: Request) {
  return handleMcpRequest({ req, tools });
}
