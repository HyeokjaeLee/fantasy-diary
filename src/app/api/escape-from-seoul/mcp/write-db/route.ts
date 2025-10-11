import { randomUUID } from 'node:crypto';

import { client } from '@supabase-api/client.gen';
import {
  deleteEscapeFromSeoulCharacters,
  deleteEscapeFromSeoulEntries,
  deleteEscapeFromSeoulPlaces,
  getEscapeFromSeoulCharacters,
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
import {
  zEscapeFromSeoulCharacters,
  zEscapeFromSeoulEntries,
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

// zod schemas for safe parsing (avoid type assertions) for tool arguments

const zId = z.object({ id: z.string().uuid() });

const zWeatherItem = z
  .object({
    category: z.string().min(1),
    obsrValue: z
      .union([z.string(), z.number()])
      .transform((value) =>
        typeof value === 'string' ? value.trim() : value.toString(),
      ),
  })
  .loose();

const zWeatherSnapshot = z
  .object({
    baseDate: z.string().regex(/^\d{8}$/),
    baseTime: z.string().regex(/^\d{4}$/),
    items: z.array(zWeatherItem).min(1),
  })
  .loose();

// Entries
const zEntriesCreate = zEscapeFromSeoulEntries
  .extend({
    weather: zWeatherSnapshot,
  })
  .loose();

const zEntriesUpdate = zEscapeFromSeoulEntries
  .partial()
  .extend({
    id: z.string().uuid(),
    weather: zWeatherSnapshot.optional(),
  })
  .loose();

const zCharactersCreate = zEscapeFromSeoulCharacters
  .partial()
  .extend({
    id: z.string().uuid().optional(),
    name: zEscapeFromSeoulCharacters.shape.name,
  })
  .loose();

const zCharactersUpdate = zEscapeFromSeoulCharacters
  .partial()
  .extend({
    id: z.string().uuid(),
  })
  .loose();

const zPlacesCreate = zEscapeFromSeoulPlaces
  .partial()
  .extend({
    id: z.string().uuid().optional(),
    name: zEscapeFromSeoulPlaces.shape.name,
    current_situation:
      zEscapeFromSeoulPlaces.shape.current_situation.optional(),
  })
  .loose();

const zPlacesUpdate = zEscapeFromSeoulPlaces
  .partial()
  .extend({
    id: z.string().uuid(),
  })
  .loose();

const toStringArray = (value: unknown, fallback: string[] = []): string[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => (typeof item === 'string' ? item : String(item)).trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : fallback;
};

const stripUndefined = <T extends Record<string, unknown>>(
  value: T,
): Partial<T> => {
  const entries = Object.entries(value).filter(([, val]) => val !== undefined);

  return Object.fromEntries(entries) as Partial<T>;
};

const deriveWeatherCondition = (
  ptyRaw: string | null,
  skyRaw: string | null,
) => {
  if (ptyRaw !== null && ptyRaw.length > 0) {
    const precipitationCode = Number.parseInt(ptyRaw, 10);
    if (Number.isFinite(precipitationCode) && precipitationCode > 0) {
      switch (precipitationCode) {
        case 1:
          return 'rain';
        case 2:
          return 'rain and snow';
        case 3:
          return 'snow';
        case 4:
          return 'showers';
        case 5:
          return 'drizzle';
        case 6:
          return 'sleet';
        case 7:
          return 'flurries';
        default:
          return 'precipitation';
      }
    }
  }

  if (skyRaw !== null && skyRaw.length > 0) {
    const skyCode = Number.parseInt(skyRaw, 10);
    if (Number.isFinite(skyCode) && skyCode > 0) {
      switch (skyCode) {
        case 1:
          return 'clear';
        case 2:
          return 'partly cloudy';
        case 3:
          return 'mostly cloudy';
        case 4:
          return 'overcast';
        default:
          return 'cloudy';
      }
    }
  }

  return null;
};

const deriveWeatherFromSnapshot = (
  snapshot: z.infer<typeof zWeatherSnapshot>,
) => {
  const observationByCategory = new Map<string, string>();
  for (const item of snapshot.items) {
    const category = item.category.trim().toUpperCase();
    if (!category) continue;

    const value = item.obsrValue.trim();
    if (!value) continue;

    observationByCategory.set(category, value);
  }

  const getValue = (category: string) =>
    observationByCategory.get(category.toUpperCase()) ?? null;

  const temperatureRaw = getValue('T1H') ?? getValue('TMP') ?? getValue('T3H');
  const parsedTemperature =
    temperatureRaw !== null ? Number.parseFloat(temperatureRaw) : Number.NaN;
  if (!Number.isFinite(parsedTemperature)) {
    throw new Error(
      'weather: missing temperature (category T1H) from geo.gridPlaceWeather response',
    );
  }

  const roundedTemperature = Math.round(parsedTemperature);
  if (roundedTemperature < -100 || roundedTemperature > 100) {
    throw new Error(
      `weather: unreasonable temperature value (${roundedTemperature})`,
    );
  }

  const condition = deriveWeatherCondition(getValue('PTY'), getValue('SKY'));
  if (!condition) {
    throw new Error(
      'weather: missing PTY/SKY categories in geo.gridPlaceWeather response',
    );
  }

  return { condition, temperature: roundedTemperature };
};

const withEntryDefaults = (
  parsed: z.infer<typeof zEntriesCreate>,
): EscapeFromSeoulEntries => {
  const nowIso = new Date().toISOString();
  const weather = deriveWeatherFromSnapshot(parsed.weather);
  const majorEvents = toStringArray(parsed.major_events);
  const appearedCharacters = toStringArray(parsed.appeared_characters);
  const storyTags = toStringArray(parsed.story_tags);
  if (storyTags.length === 0) {
    throw new Error('story_tags must contain at least one tag');
  }

  return {
    id: parsed.id ?? randomUUID(),
    created_at: parsed.created_at ?? nowIso,
    content: parsed.content,
    summary: parsed.summary.trim(),
    weather_condition: weather.condition,
    weather_temperature: weather.temperature,
    location: parsed.location.trim(),
    mood: parsed.mood.trim(),
    major_events: majorEvents,
    appeared_characters: appearedCharacters,
    emotional_tone: parsed.emotional_tone.trim(),
    story_tags: storyTags,
    previous_context: parsed.previous_context.trim(),
    next_context_hints: parsed.next_context_hints.trim(),
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
      required: [
        'content',
        'weather',
        'summary',
        'location',
        'mood',
        'major_events',
        'appeared_characters',
        'emotional_tone',
        'story_tags',
        'previous_context',
        'next_context_hints',
      ],
      properties: {
        content: { type: 'string', description: '일기 본문 (마크다운 형식)' },
        id: { type: 'string', format: 'uuid', description: '선택적 UUID' },
        weather: {
          type: 'object',
          description:
            'geo.gridPlaceWeather 툴에서 반환된 weather 객체(JSON). baseDate/baseTime/items가 반드시 포함되어야 합니다.',
        },
        created_at: {
          type: 'string',
          format: 'date-time',
          description: '선택적 작성 시각 (ISO 8601)',
        },
        summary: {
          type: 'string',
          description: '챕터 요약 텍스트 (280자 이내 추천)',
        },
        location: { type: 'string', description: '주 무대가 되는 장소 이름' },
        mood: { type: 'string', description: '챕터의 분위기나 감정선' },
        major_events: {
          type: 'array',
          items: { type: 'string' },
          description: '주요 사건 목록',
        },
        appeared_characters: {
          type: 'array',
          items: { type: 'string' },
          description: '챕터에 등장한 인물 이름 목록',
        },
        emotional_tone: {
          type: 'string',
          description: '전반적인 감정 톤',
        },
        story_tags: {
          type: 'array',
          items: { type: 'string' },
          description: '스토리 태그 (chapter:, location:, character: 형태 등)',
        },
        previous_context: {
          type: 'string',
          description: '이전 문맥(이전 챕터 ID 등)',
        },
        next_context_hints: {
          type: 'string',
          description: '다음 전개 힌트 또는 작성 메모',
        },
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
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '수정할 일기의 ID' },
        content: {
          type: 'string',
          description: '수정할 일기 본문 (마크다운 형식)',
        },
        weather: {
          type: 'object',
          description:
            '날씨를 갱신하려면 geo.gridPlaceWeather 툴의 weather 객체(JSON)를 전달하세요.',
        },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const payload = zEntriesUpdate.parse(rawArgs);
      const { id, weather, ...rest } = payload;
      const base = stripUndefined(rest);
      const body: Partial<EscapeFromSeoulEntries> = { ...base };
      if (weather) {
        const derived = deriveWeatherFromSnapshot(weather);
        body.weather_condition = derived.condition;
        body.weather_temperature = derived.temperature;
      }
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
      const { major_events, character_traits, name, ...others } = rest;
      const normalized = stripUndefined({
        ...others,
        name: typeof name === 'string' ? name.trim() : undefined,
        major_events:
          major_events !== undefined ? toStringArray(major_events) : undefined,
        character_traits:
          character_traits !== undefined
            ? toStringArray(character_traits)
            : undefined,
      }) as Partial<EscapeFromSeoulCharacters>;
      if (Object.keys(normalized).length === 0) {
        return { ok: true };
      }

      configureSupabaseRest();
      const { data, error: fetchError } = await getEscapeFromSeoulCharacters({
        query: { id: `eq.${id}`, select: '*' },
        headers: { Range: '0-0' },
      });
      if (fetchError) {
        throw new Error(JSON.stringify(fetchError));
      }
      const parsed = zEscapeFromSeoulCharacters
        .array()
        .safeParse(data ?? []);
      if (!parsed.success) {
        throw new Error(
          `Unexpected response when loading character: ${parsed.error.message}`,
        );
      }
      const current = parsed.data[0];
      if (!current) {
        throw new Error(`Character ${id} not found`);
      }

      const { last_updated, ...restNormalized } = normalized;
      const lastUpdated = last_updated ?? new Date().toISOString();
      const merged: EscapeFromSeoulCharacters = {
        ...current,
        ...restNormalized,
        id: current.id,
        name: restNormalized.name ?? current.name,
        major_events: restNormalized.major_events ?? current.major_events ?? [],
        character_traits:
          restNormalized.character_traits ?? current.character_traits ?? [],
        last_updated: lastUpdated,
      };

      const { error } = await patchEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: merged,
      });
      if (error) throw new Error(JSON.stringify(error));

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
