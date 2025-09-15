import { client } from '@supabase-api/client.gen';

import { SUPABASE } from '@/constants/supabase';
import { ENV } from '@/env';

// Configure the OpenAPI client with Supabase REST base URL + service role
export function ensureSupabaseRestConfigured() {
  client.setConfig({
    baseUrl: SUPABASE.BASE_URL,
    headers: {
      apikey: ENV.NEXT_SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${ENV.NEXT_SUPABASE_SERVICE_ROLE}`,
    },
  });

  return client;
}

// Lightweight helpers for ad-hoc endpoints (e.g., places)
export const rest = {
  get: async (
    url: string,
    init?: { query?: Record<string, string>; headers?: Record<string, string> },
  ) => {
    const c = ensureSupabaseRestConfigured();

    return c.get({ url, query: init?.query, headers: init?.headers } as any);
  },
  post: async (
    url: string,
    body: unknown,
    init?: { query?: Record<string, string>; headers?: Record<string, string> },
  ) => {
    const c = ensureSupabaseRestConfigured();

    return c.post({
      url,
      body,
      query: init?.query,
      headers: init?.headers,
    } as any);
  },
  patch: async (
    url: string,
    body: unknown,
    init?: { query?: Record<string, string>; headers?: Record<string, string> },
  ) => {
    const c = ensureSupabaseRestConfigured();

    return c.patch({
      url,
      body,
      query: init?.query,
      headers: init?.headers,
    } as any);
  },
  delete: async (
    url: string,
    init?: { query?: Record<string, string>; headers?: Record<string, string> },
  ) => {
    const c = ensureSupabaseRestConfigured();

    return c.delete({ url, query: init?.query, headers: init?.headers } as any);
  },
};
