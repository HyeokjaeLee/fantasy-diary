import type { Tool } from '@/types/mcp';

import { getSupabaseServiceRoleClient } from '../_libs/configure-supabase';
import { zListArgs, zNameLookup } from './schemas';

export const characterTools: Tool[] = [
  {
    name: 'characters.list',
    description:
      '등장인물 목록을 이름 오름차순으로 조회합니다. 캐릭터 구성을 파악하거나, 새 인물을 등장시키기 전 기존 인물과의 관계를 점검할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: '조회할 캐릭터 개수',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = zListArgs.parse(rawArgs ?? {});
      const supabase = getSupabaseServiceRoleClient();
      const { data, error } = await supabase
        .from('escape_from_seoul_characters')
        .select('*')
        .order('name', { ascending: true })
        .limit(limit);
      if (error) throw new Error(JSON.stringify(error));

      return data ?? [];
    },
  },
  {
    name: 'characters.get',
    description:
      '특정 캐릭터의 상세 정보를 조회합니다. 이름으로 검색할 수 있으며, 인물의 성격, 배경, 동기 등을 정확히 반영한 대사나 행동을 묘사할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: '조회할 캐릭터 이름',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { name } = zNameLookup.parse(rawArgs ?? {});
      const supabase = getSupabaseServiceRoleClient();
      const { data, error } = await supabase
        .from('escape_from_seoul_characters')
        .select('*')
        .eq('name', name)
        .maybeSingle();
      if (error) throw new Error(JSON.stringify(error));

      return data ?? null;
    },
  },
];
