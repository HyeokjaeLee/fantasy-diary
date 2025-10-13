import {
  patchEscapeFromSeoulPlaces,
  postEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type { EscapeFromSeoulPlaces } from '@supabase-api/types.gen';
import { zEscapeFromSeoulPlaces } from '@supabase-api/zod.gen';

import type { Tool } from '@/types/mcp';

import { configureSupabaseRest } from './configureSupabaseRest';

const zPlacesUpdate = zEscapeFromSeoulPlaces.partial().extend({
  name: zEscapeFromSeoulPlaces.shape.name,
});

type EscapeFromSeoulPlacesTool = Tool<keyof EscapeFromSeoulPlaces>;

const properties: EscapeFromSeoulPlacesTool['inputSchema']['properties'] = {
  name: { type: 'string', description: '장소 이름' },
  current_situation: {
    type: 'string',
    description: '장소의 현재 상황 설명',
  },
  latitude: {
    type: 'number',
    description: '위도 값',
  },
  longitude: {
    type: 'number',
    description: '경도 값',
  },
  last_weather_condition: {
    type: 'string',
    description: '마지막으로 확인한 날씨 상태',
  },
  last_weather_weather_condition: {
    type: 'string',
    description: '마지막으로 확인한 상세 날씨 상태',
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

export const placeTools: EscapeFromSeoulPlacesTool[] = [
  {
    name: 'places.create',
    description:
      '새로운 장소를 생성합니다. 배경이 되는 위치와 관련 정보를 등록할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties,
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const body = zEscapeFromSeoulPlaces.parse(raw);

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
      properties,
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { name, ...body } = zPlacesUpdate.parse(rawArgs);

      if (Object.keys(body).length === 0) {
        return { ok: true };
      }

      configureSupabaseRest();

      const { error } = await patchEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=minimal' },
        query: { name },
        body,
      });

      if (error) throw new Error(String(error));

      return { ok: true };
    },
  },
];
