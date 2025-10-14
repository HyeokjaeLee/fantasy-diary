import { client } from '@supabase-api/client.gen';
import {
  getEscapeFromSeoulCharacters,
  getEscapeFromSeoulEpisodes,
  getEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { publicProcedure, router } from '@/configs/trpc/settings';
import { ENV } from '@/env';
import type { Tool } from '@/types/mcp';

const configureSupabaseRest = () => {
  const url = (ENV.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const baseUrl = `${url}/rest/v1`;
  const serviceRole = ENV.NEXT_SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SERVICE_ROLE env when fetching stories',
    });
  }

  client.setConfig({
    baseUrl,
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  });
};

const zListArgs = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});
const zEpisodeId = z.object({ id: z.string().min(1) });
const zNameLookup = z.object({ name: z.string().min(1) });

export const readDbTools: Tool[] = [
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
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulCharacters({
        headers: { Prefer: 'count=none' },
        query: { order: 'name.asc', limit: String(limit) },
      });
      if (error) throw new Error(JSON.stringify(error));

      return Array.isArray(data) ? data : [];
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
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulCharacters({
        headers: { Prefer: 'count=none' },
        query: { name: `eq.${name}`, limit: '1' },
      });
      if (error) throw new Error(JSON.stringify(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
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

const sanitizeTool = (tool: Tool): Omit<Tool, 'handler'> => {
  const { handler: _handler, ...rest } = tool;
  void _handler;

  return rest;
};

const zCallInput = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});

export const escapeFromSeoulReadDbRouter = router({
  list: publicProcedure.query(() =>
    readDbTools.map((tool) => sanitizeTool(tool)),
  ),
  execute: publicProcedure.input(zCallInput).mutation(async ({ input }) => {
    const tool = readDbTools.find((candidate) => candidate.name === input.name);
    if (!tool) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `read-db tool ${input.name} not found`,
      });
    }

    const result = await tool.handler(input.arguments ?? {});

    return JSON.stringify(result);
  }),
});
