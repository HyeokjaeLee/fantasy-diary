import { getEscapeFromSeoulPlaces } from '@supabase-api/sdk.gen';

import type { Tool } from '@/types/mcp';

import { configureSupabaseRest } from '../_libs/configure-supabase';
import { zListArgs, zNameLookup } from './schemas';

export const placeTools: Tool[] = [
  {
    name: 'places.list',
    description:
      '장소 목록을 이름 오름차순으로 조회합니다. 다음 장면의 배경을 선택하거나, 스토리 전개에 따라 이동 가능한 장소를 파악할 때 사용하세요.',
    inputSchema: {
      required: [],
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: '조회할 장소 개수',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = zListArgs.parse(rawArgs ?? {});
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulPlaces({
        headers: { Prefer: 'count=none' },
        query: { order: 'name.asc', limit: String(limit) },
      });
      if (error) throw new Error(JSON.stringify(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'places.get',
    description:
      '특정 장소의 상세 정보를 조회합니다. 이름으로 검색할 수 있으며, 장소의 분위기, 구조, 특징 등을 정확히 묘사할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: '조회할 장소 이름',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { name } = zNameLookup.parse(rawArgs ?? {});
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulPlaces({
        headers: { Prefer: 'count=none' },
        query: { name: `eq.${name}`, limit: '1' },
      });
      if (error) throw new Error(JSON.stringify(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
];
