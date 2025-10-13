import {
  patchEscapeFromSeoulCharacters,
  postEscapeFromSeoulCharacters,
} from '@supabase-api/sdk.gen';
import type { EscapeFromSeoulCharacters } from '@supabase-api/types.gen';
import { zEscapeFromSeoulCharacters } from '@supabase-api/zod.gen';

import type { Tool } from '@/types/mcp';

import { configureSupabaseRest } from './configureSupabaseRest';

const zCharactersUpdate = zEscapeFromSeoulCharacters.partial().extend({
  name: zEscapeFromSeoulCharacters.shape.name,
});

type EscapeFromSeoulCharactersTool = Tool<keyof EscapeFromSeoulCharacters>;

const properties: EscapeFromSeoulCharactersTool['inputSchema']['properties'] = {
  name: { type: 'string', description: '캐릭터 이름' },
  personality: {
    type: 'string',
    description: '캐릭터 성격 묘사',
  },
  background: {
    type: 'string',
    description: '캐릭터 배경 설명',
  },
  appearance: {
    type: 'string',
    description: '캐릭터 외형 묘사',
  },
  current_place: {
    type: 'string',
    description: '현재 위치 (escape_from_seoul_places.name 참조)',
  },
  relationships: {
    type: 'object',
    description: '캐릭터간의 관계',
  },
  major_events: {
    type: 'array',
    description: '캐릭터 주요 사건 목록',
    items: { type: 'string' },
  },
  character_traits: {
    type: 'array',
    description: '캐릭터 특징 키워드 목록',
    items: { type: 'string' },
  },
  current_status: {
    type: 'string',
    description: '캐릭터 현재 상태',
  },
  updated_at: {
    type: 'string',
    description: 'ISO 포맷의 업데이트 시간',
  },
  last_mentioned_episode_id: {
    type: 'string',
    description: '마지막으로 언급된 에피소드 ID',
  },
};

export const characterTools: EscapeFromSeoulCharactersTool[] = [
  {
    name: 'characters.create',
    description:
      '새로운 캐릭터를 생성합니다. 이름과 기본 프로필, 현재 위치 등을 저장할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: [
        'name',
        'personality',
        'background',
        'appearance',
        'current_place',
        'relationships',
        'major_events',
        'character_traits',
        'current_status',
        'last_mentioned_episode_id',
      ],
      properties,
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const body = zEscapeFromSeoulCharacters.parse(raw);

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
      required: [
        'name',
        'personality',
        'background',
        'appearance',
        'current_place',
        'relationships',
        'major_events',
        'character_traits',
        'current_status',
        'last_mentioned_episode_id',
      ],
      properties,
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { name, ...body } = zCharactersUpdate.parse(rawArgs);

      if (Object.keys(body).length === 0) {
        return { ok: true };
      }

      configureSupabaseRest();

      const { error } = await patchEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=minimal' },
        query: { name },
        body,
      });

      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
];
