import { client } from '@supabase-api/client.gen';
import {
  deleteEscapeFromSeoulCharacters,
  deleteEscapeFromSeoulEntries,
  deleteEscapeFromSeoulPlaces,
  patchEscapeFromSeoulCharacters,
  patchEscapeFromSeoulEntries,
  patchEscapeFromSeoulPlaces,
  postEscapeFromSeoulCharacters,
  postEscapeFromSeoulEntries,
  postEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type { JSONSchema4 } from 'json-schema';
import { z } from 'zod';

import { ENV } from '@/env';
import {
  JsonRpcErrorCode,
  JsonRpcErrorMessage,
  zCallToolParams,
  zJsonRpcRequest,
} from '@/types/mcp';
import { NextResponse } from '@/utils';

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
}

interface ToolDef<TArgs, TResult> {
  name: string;
  description: string;
  inputSchema: JSONSchema4;
  handler: (args: TArgs) => Promise<TResult>;
}

// zod schemas for safe parsing (avoid type assertions) for tool arguments

const zId = z.object({ id: z.string().uuid() });

// Entries
const zEntriesCreate = z
  .object({
    content: z.string(),
    id: z.string().uuid().optional(),
  })
  .passthrough();
const zEntriesUpdate = z
  .object({
    id: z.string().uuid(),
    content: z.string(),
  })
  .passthrough();

// Characters
const zCharactersCreate = z
  .object({
    name: z.string(),
    id: z.string().uuid().optional(),
  })
  .passthrough();
const zCharactersUpdate = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
  })
  .passthrough();

// Places
const zPlacesCreate = z
  .object({
    name: z.string(),
    id: z.string().uuid().optional(),
  })
  .passthrough();
const zPlacesUpdate = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
  })
  .passthrough();

const tools: Array<ToolDef<unknown, unknown>> = [
  // entries.*
  {
    name: 'entries.create',
    description:
      '새로운 일기를 생성합니다. 작성한 스토리 텍스트를 DB에 저장할 때 사용하세요. content 필드에 마크다운 형식의 본문을 포함해야 합니다.',
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', description: '일기 본문 (마크다운 형식)' },
        id: { type: 'string', format: 'uuid', description: '선택적 UUID' },
      },
      additionalProperties: true,
    },
    handler: async (raw: unknown) => {
      const parsed = zEntriesCreate.parse(raw);
      const body = { id: parsed.id ?? crypto.randomUUID(), ...parsed };
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
      required: ['id', 'content'],
      properties: {
        id: { type: 'string', format: 'uuid', description: '수정할 일기의 ID' },
        content: {
          type: 'string',
          description: '수정할 일기 본문 (마크다운 형식)',
        },
      },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const payload = zEntriesUpdate.parse(rawArgs);
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulEntries({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${payload.id}` },
        body: payload,
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
      const body = { id: parsed.id ?? crypto.randomUUID(), ...parsed };
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
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${payload.id}` },
        body: payload,
      });
      if (error) throw new Error(String(error));

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
      const body = { id: parsed.id ?? crypto.randomUUID(), ...parsed };
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
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${payload.id}` },
        body: payload,
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
  let body: z.infer<typeof zJsonRpcRequest> | null = null;

  try {
    const request = zJsonRpcRequest.parse(await req.json());
    body = request;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return NextResponse.jsonRpcFail({
        code: JsonRpcErrorCode.InvalidRequest,
        message: JsonRpcErrorMessage.InvalidRequest,
        id: request.id ?? null,
      });
    }

    if (request.method === 'tools/list') {
      return NextResponse.jsonRpcOk({
        id: request.id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      });
    }

    if (request.method === 'tools/call') {
      const parsed = zCallToolParams.safeParse(request.params ?? {});
      if (!parsed.success || !parsed.data.name)
        return NextResponse.jsonRpcFail({
          code: JsonRpcErrorCode.InvalidParams,
          message: JsonRpcErrorMessage.InvalidParams,
          id: request.id,
        });

      const tool = tools.find((t) => t.name === parsed.data.name);
      if (!tool)
        return NextResponse.jsonRpcFail({
          code: JsonRpcErrorCode.ToolNotFound,
          message: JsonRpcErrorMessage.ToolNotFound,
          id: request.id,
        });

      const result = await tool.handler(parsed.data.arguments ?? {});

      return NextResponse.json(
        NextResponse.jsonRpcOk({
          id: request.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          },
        }),
      );
    }

    return NextResponse.jsonRpcFail({
      code: JsonRpcErrorCode.MethodNotFound,
      message: JsonRpcErrorMessage.MethodNotFound,
      id: request.id,
    });
  } catch (e) {
    return NextResponse.jsonRpcFail({
      id: body?.id ?? null,
      code: JsonRpcErrorCode.UnknownError,
      message:
        e instanceof Error ? e.message : JsonRpcErrorMessage.UnknownError,
    });
  }
}
