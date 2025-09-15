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
import { NextResponse } from 'next/server';

import { ENV } from '@/env';

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}
interface JsonRpcSuccess<T> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: T;
}
interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcError;
}
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
  const url = ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
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

type IdArgs = { id: string };
type CreateArgs = Record<string, unknown>;
type UpdateArgs = CreateArgs & IdArgs;

const tools: Array<ToolDef<unknown, unknown>> = [
  // entries.*
  {
    name: 'entries.create',
    description: 'Create a diary entry',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    handler: async (body: unknown) => {
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulEntries({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body: body as CreateArgs,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'entries.update',
    description: 'Update a diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { id, ...patch } = rawArgs as UpdateArgs;
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulEntries({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: patch,
      });
      if (error) throw new Error(String(error));

      return { ok: true } as const;
    },
  },
  {
    name: 'entries.delete',
    description: 'Delete a diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as IdArgs;
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulEntries({
        query: { id: `eq.${id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true } as const;
    },
  },

  // characters.*
  {
    name: 'characters.create',
    description: 'Create character',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    handler: async (body: unknown) => {
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body: body as CreateArgs,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'characters.update',
    description: 'Update character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { id, ...patch } = rawArgs as UpdateArgs;
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: patch,
      });
      if (error) throw new Error(String(error));

      return { ok: true } as const;
    },
  },
  {
    name: 'characters.delete',
    description: 'Delete character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as IdArgs;
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulCharacters({
        query: { id: `eq.${id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true } as const;
    },
  },

  // places.*
  {
    name: 'places.create',
    description: 'Create place',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    handler: async (body: unknown) => {
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body: body as CreateArgs,
      });
      if (error) throw new Error(String(error));

      return data;
    },
  },
  {
    name: 'places.update',
    description: 'Update place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { id, ...patch } = rawArgs as UpdateArgs;
      configureSupabaseRest();
      const { error } = await patchEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=minimal' },
        query: { id: `eq.${id}` },
        body: patch,
      });
      if (error) throw new Error(String(error));

      return { ok: true } as const;
    },
  },
  {
    name: 'places.delete',
    description: 'Delete place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as IdArgs;
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulPlaces({
        query: { id: `eq.${id}` },
      });
      if (error) throw new Error(String(error));

      return { ok: true } as const;
    },
  },
];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as JsonRpcRequest;
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
      const params = body.params as
        | { name?: string; arguments?: unknown }
        | undefined;
      if (!params?.name)
        return NextResponse.json(fail(body.id, -32602, 'Missing tool name'), {
          status: 400,
        });
      const tool = tools.find((t) => t.name === params.name);
      if (!tool)
        return NextResponse.json(
          fail(body.id, -32601, `Unknown tool: ${params.name}`),
          { status: 404 },
        );
      const result = await tool.handler(params.arguments ?? {});

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
