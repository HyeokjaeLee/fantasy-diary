import { client } from '@supabase-api/client.gen';
import {
  getEscapeFromSeoulEntries,
  postEscapeFromSeoulEntries,
  patchEscapeFromSeoulEntries,
  deleteEscapeFromSeoulEntries,
  getEscapeFromSeoulCharacters,
  postEscapeFromSeoulCharacters,
  patchEscapeFromSeoulCharacters,
  deleteEscapeFromSeoulCharacters,
} from '@supabase-api/sdk.gen';
import { rest } from './_client';
import OpenAI from 'openai';
import { z } from 'zod';

import { SUPABASE } from '@/constants/supabase';
import { ENV } from '@/env';

// Tool definition
export interface ToolSpec<TInput extends z.ZodTypeAny, TResult> {
  name: string;
  description: string;
  input: TInput;
  execute: (args: z.infer<TInput>) => Promise<TResult>;
}

function setupServerClient() {
  client.setConfig({
    baseUrl: SUPABASE.BASE_URL,
    headers: {
      apikey: ENV.NEXT_SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${ENV.NEXT_SUPABASE_SERVICE_ROLE}`,
    },
  });
}

function getOpenAI() {
  return new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
}

// list_diary_entries: fetch diary entries from Supabase REST
const listDiaryEntriesInput = z
  .object({
    limit: z.number().int().positive().max(100).default(20).optional(),
  })
  .default({});

type ListDiaryEntry = unknown; // Use generated types if needed later

const listDiaryEntries: ToolSpec<
  typeof listDiaryEntriesInput,
  ListDiaryEntry[]
> = {
  name: 'list_diary_entries',
  description: 'Fetch recent diary entries from Supabase (max 100).',
  input: listDiaryEntriesInput,
  execute: async ({ limit = 20 }) => {
    setupServerClient();
    const { data, error } = await getEscapeFromSeoulEntries();

    if (error) {
      throw new Error(`Supabase error: ${String(error)}`);
    }

    const entries = Array.isArray(data) ? data : [];

    return entries.slice(0, Math.max(0, Math.min(limit, 100)));
  },
};

// summarize_diary_entries: get entries and summarize with OpenAI

const summarizeDiaryEntriesInput = z
  .object({
    limit: z.number().int().positive().max(20).default(5).optional(),
    model: z.string().default('gpt-4o-mini').optional(),
    language: z.string().default('ko').optional(),
  })
  .default({});

const summarizeDiaryEntries: ToolSpec<
  typeof summarizeDiaryEntriesInput,
  { summary: string }
> = {
  name: 'summarize_diary_entries',
  description:
    'Fetch recent diary entries from Supabase and summarize them using OpenAI.',
  input: summarizeDiaryEntriesInput,
  execute: async ({ limit = 5, model = 'gpt-4o-mini', language = 'ko' }) => {
    setupServerClient();
    const { data, error } = await getEscapeFromSeoulEntries();

    if (error) {
      throw new Error(`Supabase error: ${String(error)}`);
    }

    const entries = (Array.isArray(data) ? data : []).slice(
      0,
      Math.max(0, Math.min(limit, 20)),
    );

    const openai = getOpenAI();

    const content =
      entries.length === 0 ? 'No entries.' : JSON.stringify(entries, null, 2);

    const prompt = [
      `You are an assistant that summarizes diary entries.`,
      `Return a concise summary in ${language}.`,
      `Entries:`,
      content,
    ].join('\n');

    // Using chat.completions for broader compatibility
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You summarize data precisely.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    const summary = completion.choices[0]?.message?.content ?? '';

    return { summary };
  },
};

// tools are appended at the bottom; see extended list

// =========================
// Entries tools (CRUD)
// =========================

const entriesListInput = z
  .object({ limit: z.number().int().positive().max(100).default(50).optional() })
  .default({});

const entriesGetInput = z.object({ id: z.string().uuid() });

const entriesCreateInput = z.object({
  content: z.string().min(1),
  summary: z.string().optional(),
  weather_condition: z.string().optional(),
  weather_temperature: z.number().optional(),
  location: z.string().optional(),
  mood: z.string().optional(),
  major_events: z.array(z.string()).optional(),
  appeared_characters: z.array(z.string()).optional(),
  emotional_tone: z.string().optional(),
  story_tags: z.array(z.string()).optional(),
  previous_context: z.string().optional(),
  next_context_hints: z.string().optional(),
});

const entriesUpdateInput = entriesCreateInput.partial().extend({ id: z.string().uuid() });

export const entriesList: ToolSpec<typeof entriesListInput, unknown[]> = {
  name: 'entries_list',
  description: 'List diary entries ordered by created_at desc',
  input: entriesListInput,
  execute: async ({ limit = 50 }) => {
    setupServerClient();
    const { data, error } = await getEscapeFromSeoulEntries({
      headers: { Prefer: 'count=none' },
      query: { order: 'created_at.desc', limit: String(limit) },
    });
    if (error) throw new Error(String(error));
    return Array.isArray(data) ? data : [];
  },
};

export const entriesGet: ToolSpec<typeof entriesGetInput, unknown> = {
  name: 'entries_get',
  description: 'Get a single diary entry by id',
  input: entriesGetInput,
  execute: async ({ id }) => {
    setupServerClient();
    const { data, error } = await getEscapeFromSeoulEntries({
      headers: { Prefer: 'count=none' },
      query: { id: `eq.${id}`, limit: '1' },
    });
    if (error) throw new Error(String(error));
    return Array.isArray(data) ? data[0] ?? null : null;
  },
};

export const entriesCreate: ToolSpec<typeof entriesCreateInput, unknown> = {
  name: 'entries_create',
  description: 'Create a diary entry',
  input: entriesCreateInput,
  execute: async (body) => {
    setupServerClient();
    const { data, error } = await postEscapeFromSeoulEntries({
      headers: { Prefer: 'return=representation' },
      query: { select: '*' },
      body,
    });
    if (error) throw new Error(String(error));
    return data as unknown;
  },
};

export const entriesUpdate: ToolSpec<typeof entriesUpdateInput, { ok: true }> = {
  name: 'entries_update',
  description: 'Update a diary entry by id',
  input: entriesUpdateInput,
  execute: async ({ id, ...patch }) => {
    setupServerClient();
    const { error } = await patchEscapeFromSeoulEntries({
      headers: { Prefer: 'return=minimal' },
      query: { id: `eq.${id}` },
      body: patch,
    });
    if (error) throw new Error(String(error));
    return { ok: true } as const;
  },
};

export const entriesDelete: ToolSpec<typeof entriesGetInput, { ok: true }> = {
  name: 'entries_delete',
  description: 'Delete a diary entry by id',
  input: entriesGetInput,
  execute: async ({ id }) => {
    setupServerClient();
    const { error } = await deleteEscapeFromSeoulEntries({ query: { id: `eq.${id}` } });
    if (error) throw new Error(String(error));
    return { ok: true } as const;
  },
};

// =========================
// Characters tools (CRUD)
// =========================

const charactersListInput = z
  .object({ limit: z.number().int().positive().max(100).default(50).optional() })
  .default({});
const charactersIdInput = z.object({ id: z.string().uuid() });
const charactersCreateInput = z.object({
  name: z.string().min(1),
  personality: z.string().optional(),
  background: z.string().optional(),
  appearance: z.string().optional(),
  current_location: z.string().optional(),
  relationships: z.any().optional(),
  major_events: z.array(z.string()).optional(),
  character_traits: z.array(z.string()).optional(),
  current_status: z.string().optional(),
});
const charactersUpdateInput = charactersCreateInput.partial().extend({ id: z.string().uuid() });

export const charactersList: ToolSpec<typeof charactersListInput, unknown[]> = {
  name: 'characters_list',
  description: 'List characters ordered by name asc',
  input: charactersListInput,
  execute: async ({ limit = 50 }) => {
    setupServerClient();
    const { data, error } = await getEscapeFromSeoulCharacters({
      headers: { Prefer: 'count=none' },
      query: { order: 'name.asc', limit: String(limit) },
    });
    if (error) throw new Error(String(error));
    return Array.isArray(data) ? data : [];
  },
};

export const charactersGet: ToolSpec<typeof charactersIdInput, unknown> = {
  name: 'characters_get',
  description: 'Get character by id',
  input: charactersIdInput,
  execute: async ({ id }) => {
    setupServerClient();
    const { data, error } = await getEscapeFromSeoulCharacters({
      headers: { Prefer: 'count=none' },
      query: { id: `eq.${id}`, limit: '1' },
    });
    if (error) throw new Error(String(error));
    return Array.isArray(data) ? data[0] ?? null : null;
  },
};

export const charactersCreate: ToolSpec<typeof charactersCreateInput, unknown> = {
  name: 'characters_create',
  description: 'Create character',
  input: charactersCreateInput,
  execute: async (body) => {
    setupServerClient();
    const { data, error } = await postEscapeFromSeoulCharacters({
      headers: { Prefer: 'return=representation' },
      query: { select: '*' },
      body,
    });
    if (error) throw new Error(String(error));
    return data as unknown;
  },
};

export const charactersUpdate: ToolSpec<typeof charactersUpdateInput, { ok: true }> = {
  name: 'characters_update',
  description: 'Update character by id',
  input: charactersUpdateInput,
  execute: async ({ id, ...patch }) => {
    setupServerClient();
    const { error } = await patchEscapeFromSeoulCharacters({
      headers: { Prefer: 'return=minimal' },
      query: { id: `eq.${id}` },
      body: patch,
    });
    if (error) throw new Error(String(error));
    return { ok: true } as const;
  },
};

export const charactersDelete: ToolSpec<typeof charactersIdInput, { ok: true }> = {
  name: 'characters_delete',
  description: 'Delete character by id',
  input: charactersIdInput,
  execute: async ({ id }) => {
    setupServerClient();
    const { error } = await deleteEscapeFromSeoulCharacters({ query: { id: `eq.${id}` } });
    if (error) throw new Error(String(error));
    return { ok: true } as const;
  },
};

// =========================
// Places tools (CRUD)
// =========================

const placesListInput = z
  .object({ limit: z.number().int().positive().max(100).default(50).optional() })
  .default({});
const placesIdInput = z.object({ id: z.string().uuid() });
const placesCreateInput = z.object({
  name: z.string().min(1),
  current_situation: z.string().optional(),
});
const placesUpdateInput = placesCreateInput.partial().extend({ id: z.string().uuid() });

export const placesList: ToolSpec<typeof placesListInput, unknown[]> = {
  name: 'places_list',
  description: 'List places ordered by name asc',
  input: placesListInput,
  execute: async ({ limit = 50 }) => {
    await setupServerClient();
    const { data, error } = await rest.get('/escape_from_seoul_places', {
      headers: { Prefer: 'count=none' },
      query: { order: 'name.asc', limit: String(limit) },
    });
    if (error) throw new Error(String(error));
    return Array.isArray(data) ? data : [];
  },
};

export const placesGet: ToolSpec<typeof placesIdInput, unknown> = {
  name: 'places_get',
  description: 'Get place by id',
  input: placesIdInput,
  execute: async ({ id }) => {
    await setupServerClient();
    const { data, error } = await rest.get('/escape_from_seoul_places', {
      headers: { Prefer: 'count=none' },
      query: { id: `eq.${id}`, limit: '1' },
    });
    if (error) throw new Error(String(error));
    return Array.isArray(data) ? data[0] ?? null : null;
  },
};

export const placesCreate: ToolSpec<typeof placesCreateInput, unknown> = {
  name: 'places_create',
  description: 'Create place',
  input: placesCreateInput,
  execute: async (body) => {
    await setupServerClient();
    const { data, error } = await rest.post('/escape_from_seoul_places', body, {
      headers: { Prefer: 'return=representation' },
      query: { select: '*' },
    });
    if (error) throw new Error(String(error));
    return data as unknown;
  },
};

export const placesUpdate: ToolSpec<typeof placesUpdateInput, { ok: true }> = {
  name: 'places_update',
  description: 'Update place by id',
  input: placesUpdateInput,
  execute: async ({ id, ...patch }) => {
    await setupServerClient();
    const { error } = await rest.patch('/escape_from_seoul_places', patch, {
      headers: { Prefer: 'return=minimal' },
      query: { id: `eq.${id}` },
    });
    if (error) throw new Error(String(error));
    return { ok: true } as const;
  },
};

export const placesDelete: ToolSpec<typeof placesIdInput, { ok: true }> = {
  name: 'places_delete',
  description: 'Delete place by id',
  input: placesIdInput,
  execute: async ({ id }) => {
    await setupServerClient();
    const { error } = await rest.delete('/escape_from_seoul_places', {
      query: { id: `eq.${id}` },
    });
    if (error) throw new Error(String(error));
    return { ok: true } as const;
  },
};

// Extend exported tools
export const tools = [
  listDiaryEntries,
  summarizeDiaryEntries,
  entriesList,
  entriesGet,
  entriesCreate,
  entriesUpdate,
  entriesDelete,
  charactersList,
  charactersGet,
  charactersCreate,
  charactersUpdate,
  charactersDelete,
  placesList,
  placesGet,
  placesCreate,
  placesUpdate,
  placesDelete,
] as const;

export function getToolByName(name: string) {
  return tools.find((t) => t.name === name);
}
