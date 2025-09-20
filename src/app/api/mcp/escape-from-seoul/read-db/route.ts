import { client } from '@supabase-api/client.gen';
import {
  getEscapeFromSeoulCharacters,
  getEscapeFromSeoulEntries,
  getEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import type { JSONSchema4 } from 'json-schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ENV } from '@/env';
import {
  type JsonRpcFailure,
  type JsonRpcId,
  type JsonRpcSuccess,
  zCallToolParams,
  zJsonRpcRequest,
} from '@/types/mcp';

export const runtime = 'edge';

function ok<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: '2.0', id, result };
}
function fail(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function configureSupabaseRest(): void {
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

// zod schemas for safe arg parsing
const zListArgs = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});
const zId = z.object({ id: z.string().uuid() });

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'entries.list',
    description: 'List diary entries ordered by created_at desc',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = zListArgs.parse(rawArgs ?? {});
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEntries({
        headers: { Prefer: 'count=none' },
        query: { order: 'created_at.desc', limit: String(limit) },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'entries.get',
    description: 'Get a single diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zId.parse(rawArgs);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEntries({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
  {
    name: 'characters.list',
    description: 'List characters ordered by name asc',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
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
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'characters.get',
    description: 'Get character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zId.parse(rawArgs);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulCharacters({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
  {
    name: 'places.list',
    description: 'List places ordered by name asc',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
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
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? data : [];
    },
  },
  {
    name: 'places.get',
    description: 'Get place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = zId.parse(rawArgs);
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulPlaces({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));

      return Array.isArray(data) ? (data[0] ?? null) : null;
    },
  },
];

export async function POST(req: Request) {
  try {
    const body = zJsonRpcRequest.parse(await req.json());
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return NextResponse.json(fail(null, -32600, 'Invalid Request'), {
        status: 400,
      });
    }

    if (body.method === 'tools/list') {
      return NextResponse.json(
        ok(body.id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        }),
      );
    }

    if (body.method === 'tools/call') {
      const parsed = zCallToolParams.safeParse(body.params ?? {});
      if (!parsed.success || !parsed.data.name)
        return NextResponse.json(fail(body.id, -32602, 'Missing tool name'), {
          status: 400,
        });
      const tool = tools.find((t) => t.name === parsed.data.name);
      if (!tool)
        return NextResponse.json(
          fail(body.id, -32601, `Unknown tool: ${parsed.data.name}`),
          { status: 404 },
        );
      const result = await tool.handler(parsed.data.arguments ?? {});

      return NextResponse.json(
        ok(body.id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }),
      );
    }

    return NextResponse.json(
      fail(body.id, -32601, `Unknown method: ${body.method}`),
      { status: 404 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json(fail(null, -32000, message), { status: 500 });
  }
}
