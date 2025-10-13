import {
  patchEscapeFromSeoulEpisodes,
  postEscapeFromSeoulEpisodes,
} from '@supabase-api/sdk.gen';
import type { EscapeFromSeoulEpisodes } from '@supabase-api/types.gen';
import { zEscapeFromSeoulEpisodes } from '@supabase-api/zod.gen';
import { z } from 'zod';

import type { Tool } from '@/types/mcp';

import { configureSupabaseRest } from './configureSupabaseRest';

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

const stripUndefined = <T extends Record<string, unknown>>(
  input: T,
): Partial<T> => {
  const entries = Object.entries(input).filter(([, val]) => val !== undefined);

  return Object.fromEntries(entries) as Partial<T>;
};

const SUMMARY_MAX_VALIDATION = '최대 500자까지 입력 가능합니다.';
const CONTENT_MAX_VALIDATION = '최대 5,000자까지 입력 가능합니다.';
const ID_VALIDATION = '형식은 YYYYMMDDHHmm 이어야 합니다.';

const zEpisodesCreate = zEscapeFromSeoulEpisodes.extend({
  summary: z.string().max(500, SUMMARY_MAX_VALIDATION),
  content: z.string().max(5_000, CONTENT_MAX_VALIDATION),
  id: z
    .string()
    .regex(/^\d{12}$/, ID_VALIDATION)
    .refine((val) => {
      const year = Number(val.slice(0, 4));
      const month = Number(val.slice(4, 6));
      const day = Number(val.slice(6, 8));
      const hour = Number(val.slice(8, 10));
      const minute = Number(val.slice(10, 12));

      // 유효한 날짜/시간인지 체크
      const date = new Date(year, month - 1, day, hour, minute);

      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59
      );
    }, '유효한 날짜/시간이 아닙니다.'),
});
const zEpisodesUpdate = zEpisodesCreate.partial().extend({
  id: zEpisodesCreate.shape.id,
});

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

type EscapeFromSeoulEpisodesTool = Tool<keyof EscapeFromSeoulEpisodes>;

const properties: Tool<
  keyof EscapeFromSeoulEpisodes
>['inputSchema']['properties'] = {
  id: {
    type: 'string',
    description: `에피소드 ID, 작성 시간이면서 ${ID_VALIDATION}`,
  },
  content: {
    type: 'string',
    description: `에피소드 본문, ${CONTENT_MAX_VALIDATION}`,
  },
  summary: {
    type: 'string',
    description: `간단한 요약, ${SUMMARY_MAX_VALIDATION}`,
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
};

export const episodeTools: EscapeFromSeoulEpisodesTool[] = [
  {
    name: 'episodes.create',
    description:
      '새로운 에피소드를 생성합니다. 작성한 본문과 요약, 등장한 캐릭터·장소 목록을 저장할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id', 'content', 'summary', 'characters', 'places'],
      properties,
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const body = zEpisodesCreate.parse(raw);

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
      required: [],
      properties,
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const parsed = zEpisodesUpdate.parse(rawArgs);
      const body = buildEpisodeUpdate(parsed);
      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulEpisodes({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${parsed.id}` },
        body: parsed,
      });

      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
];
