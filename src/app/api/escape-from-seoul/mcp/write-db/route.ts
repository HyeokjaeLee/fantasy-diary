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
import { z } from 'zod';

import { ENV } from '@/env';
import {
  type JsonRpcFailure,
  type JsonRpcId,
  type JsonRpcSuccess,
  zCallToolParams,
  zJsonRpcRequest,
} from '@/types/mcp';

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
    description: 'Create a diary entry',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
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
    description: 'Update a diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
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
    description: 'Delete a diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
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
    description: 'Create character',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
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
    description: 'Update character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
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
    description: 'Delete character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
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
    description: 'Create place',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
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
    description: 'Update place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
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
    description: 'Delete place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
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
