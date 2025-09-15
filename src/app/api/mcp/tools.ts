import { client } from '@supabase-api/client.gen';
import { getEscapeFromSeoulEntries } from '@supabase-api/sdk.gen';
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

export const tools = [listDiaryEntries, summarizeDiaryEntries] as const;

export function getToolByName(name: string) {
  return tools.find((t) => t.name === name);
}
