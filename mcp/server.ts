// MCP server (stdio) exposing CRUD tools for entries, characters, places
// Uses @supabase-api/* generated SDK for all network calls.
// Note: Requires @modelcontextprotocol/sdk as a dependency and build to JS before running.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/transport/node/stdio';
import { Server } from '@modelcontextprotocol/sdk/server';
import type { JSONSchema4 } from 'json-schema';
import {
  getEscapeFromSeoulEntries,
  postEscapeFromSeoulEntries,
  patchEscapeFromSeoulEntries,
  deleteEscapeFromSeoulEntries,
  getEscapeFromSeoulPlaces,
  postEscapeFromSeoulPlaces,
  patchEscapeFromSeoulPlaces,
  deleteEscapeFromSeoulPlaces,
  getEscapeFromSeoulCharacters,
  postEscapeFromSeoulCharacters,
  patchEscapeFromSeoulCharacters,
  deleteEscapeFromSeoulCharacters,
} from '@supabase-api/sdk.gen';
import { client } from '@supabase-api/client.gen';

// Configure Supabase REST client once per process
function configureSupabaseRest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const baseUrl = `${url}/rest/v1`;
  const serviceRole = process.env.NEXT_SUPABASE_SERVICE_ROLE ?? '';
  if (!url || !serviceRole) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SERVICE_ROLE');
  }
  client.setConfig({
    baseUrl,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  });
}

interface ToolDef<TArgs, TResult> {
  name: string;
  description: string;
  inputSchema: JSONSchema4;
  handler: (args: TArgs) => Promise<TResult>;
}

type EntriesListArgs = { limit?: number };
type EntriesIdArgs = { id: string };
type EntriesCreateArgs = Record<string, unknown>;
type EntriesUpdateArgs = EntriesCreateArgs & EntriesIdArgs;

type CharactersListArgs = { limit?: number };
type CharactersIdArgs = { id: string };
type CharactersCreateArgs = Record<string, unknown>;
type CharactersUpdateArgs = CharactersCreateArgs & CharactersIdArgs;

type PlacesListArgs = { limit?: number };
type PlacesIdArgs = { id: string };
type PlacesCreateArgs = Record<string, unknown>;
type PlacesUpdateArgs = PlacesCreateArgs & PlacesIdArgs;

const tools: Array<ToolDef<unknown, unknown>> = [
  // Entries
  {
    name: 'entries_list',
    description: 'List diary entries ordered by created_at desc',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = (rawArgs as EntriesListArgs) ?? {};
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
    name: 'entries_get',
    description: 'Get a single diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as EntriesIdArgs;
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulEntries({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));
      return Array.isArray(data) ? data[0] ?? null : null;
    },
  },
  {
    name: 'entries_create',
    description: 'Create a diary entry',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    handler: async (body: unknown) => {
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulEntries({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body: body as EntriesCreateArgs,
      });
      if (error) throw new Error(String(error));
      return data;
    },
  },
  {
    name: 'entries_update',
    description: 'Update a diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { id, ...patch } = rawArgs as EntriesUpdateArgs;
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
    name: 'entries_delete',
    description: 'Delete a diary entry by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as EntriesIdArgs;
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulEntries({ query: { id: `eq.${id}` } });
      if (error) throw new Error(String(error));
      return { ok: true } as const;
    },
  },

  // Characters
  {
    name: 'characters_list',
    description: 'List characters ordered by name asc',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = (rawArgs as CharactersListArgs) ?? {};
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
    name: 'characters_get',
    description: 'Get character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as CharactersIdArgs;
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulCharacters({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));
      return Array.isArray(data) ? data[0] ?? null : null;
    },
  },
  {
    name: 'characters_create',
    description: 'Create character',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    handler: async (body: unknown) => {
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulCharacters({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body: body as CharactersCreateArgs,
      });
      if (error) throw new Error(String(error));
      return data;
    },
  },
  {
    name: 'characters_update',
    description: 'Update character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { id, ...patch } = rawArgs as CharactersUpdateArgs;
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
    name: 'characters_delete',
    description: 'Delete character by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as CharactersIdArgs;
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulCharacters({ query: { id: `eq.${id}` } });
      if (error) throw new Error(String(error));
      return { ok: true } as const;
    },
  },

  // Places
  {
    name: 'places_list',
    description: 'List places ordered by name asc',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { limit = 50 } = (rawArgs as PlacesListArgs) ?? {};
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
    name: 'places_get',
    description: 'Get place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as PlacesIdArgs;
      configureSupabaseRest();
      const { data, error } = await getEscapeFromSeoulPlaces({
        headers: { Prefer: 'count=none' },
        query: { id: `eq.${id}`, limit: '1' },
      });
      if (error) throw new Error(String(error));
      return Array.isArray(data) ? data[0] ?? null : null;
    },
  },
  {
    name: 'places_create',
    description: 'Create place',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    handler: async (body: unknown) => {
      configureSupabaseRest();
      const { data, error } = await postEscapeFromSeoulPlaces({
        headers: { Prefer: 'return=representation' },
        query: { select: '*' },
        body: body as PlacesCreateArgs,
      });
      if (error) throw new Error(String(error));
      return data;
    },
  },
  {
    name: 'places_update',
    description: 'Update place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: true,
    },
    handler: async (rawArgs: unknown) => {
      const { id, ...patch } = rawArgs as PlacesUpdateArgs;
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
    name: 'places_delete',
    description: 'Delete place by id',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { id } = rawArgs as PlacesIdArgs;
      configureSupabaseRest();
      const { error } = await deleteEscapeFromSeoulPlaces({ query: { id: `eq.${id}` } });
      if (error) throw new Error(String(error));
      return { ok: true } as const;
    },
  },
];

async function main() {
  const transport = new StdioServerTransport();
  const server = new Server({ name: 'escape-from-seoul-mcp', version: '0.1.0' }, {
    capabilities: { tools: {} },
  });

  // tools/list
  server.setRequestHandler('tools/list', async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // tools/call
  function isToolCall(req: unknown): req is { params: { name: string; arguments?: unknown } } {
    const r = req as { params?: { name?: unknown; arguments?: unknown } };
    return !!r && typeof r === 'object' && !!r.params && typeof r.params.name === 'string';
  }

  server.setRequestHandler('tools/call', async (request: unknown) => {
    if (!isToolCall(request)) throw new Error('Invalid tools/call request');
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const result = await tool.handler(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
