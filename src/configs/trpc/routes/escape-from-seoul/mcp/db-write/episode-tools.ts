import {
  patchEscapeFromSeoulEpisodes,
  postEscapeFromSeoulEpisodes,
} from '@supabase-api/sdk.gen';
import type { EscapeFromSeoulEpisodes } from '@supabase-api/types.gen';
import { zEscapeFromSeoulEpisodes } from '@supabase-api/zod.gen';
import { z } from 'zod';

import type { Tool } from '@/types/mcp';

import { configureSupabaseRest } from '../_libs/configure-supabase';

const SUMMARY_MAX_VALIDATION = '최대 500자까지 입력 가능합니다.';
const CONTENT_MAX_VALIDATION = '최대 5,000자까지 입력 가능합니다.';
const ID_VALIDATION = '형식은 ISO 8601 날짜/시간 문자열이어야 합니다.';

const zEpisodesCreate = zEscapeFromSeoulEpisodes.extend({
  summary: z.string().max(500, SUMMARY_MAX_VALIDATION),
  content: z.string().max(5_000, CONTENT_MAX_VALIDATION),
  id: z.string().refine((val) => {
    // ISO 8601 형식 검증
    const date = new Date(val);

    return !Number.isNaN(date.getTime());
  }, ID_VALIDATION),
});
const zEpisodesUpdate = zEpisodesCreate.partial().extend({
  id: zEpisodesCreate.shape.id,
});

type EscapeFromSeoulEpisodesTool = Tool<keyof EscapeFromSeoulEpisodes>;

const properties: Tool<
  keyof EscapeFromSeoulEpisodes
>['inputSchema']['properties'] = {
  id: {
    type: 'string',
    description: `에피소드 ID (ISO 8601 형식의 날짜/시간 문자열)`,
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

      if (error) throw new Error(JSON.stringify(error));

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
      const { id, ...body } = zEpisodesUpdate.parse(rawArgs);

      if (Object.keys(body).length === 0) {
        return { ok: true };
      }
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulEpisodes({
        headers: { Prefer: 'return=minimal' },
        query: { id },
        body,
      });

      if (error) throw new Error(JSON.stringify(error));

      return { ok: true };
    },
  },
];
