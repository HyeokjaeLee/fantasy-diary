import { getEscapeFromSeoulEpisodes } from '@supabase-api/sdk.gen';

import type { Tool } from '@/types/mcp';

import { configureSupabaseRest } from '../_libs/configure-supabase';
import { zEpisodeId, zListArgs } from './schemas';

export const episodeTools: Tool[] = [
  {
    name: 'episodes.list',
    description:
      '작성된 에피소드 목록을 최신순(ID 내림차순)으로 조회합니다. 이전 사건의 흐름, 등장한 캐릭터, 방문한 장소 등 스토리 연속성을 확인할 때 사용하세요.',
    inputSchema: {
      required: [],
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: '조회할 에피소드 개수',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = zListArgs.parse(rawArgs ?? {});
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEpisodes({
        headers: { Prefer: 'count=none' },
        query: { order: 'id.desc', limit: String(limit) },
      });
      if (error) throw new Error(JSON.stringify(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'episodes.get',
    description:
      '특정 ID의 에피소드 내용을 상세 조회합니다. 이전 에피소드를 정확히 인용하거나 세부 묘사를 참조할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: '조회할 에피소드 ID',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zEpisodeId.parse(rawArgs ?? {});
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEpisodes({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(JSON.stringify(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
];
