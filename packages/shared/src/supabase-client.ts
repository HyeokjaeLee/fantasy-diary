import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../__generated__/supabase";

type EnvLike = Record<string, string | undefined>;

type CreateSupabaseClientParams = {
  url?: string;
  key?: string;
  env?: EnvLike;
};

function requireEnv(env: EnvLike, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export function createSupabaseAdminClient(
  params: CreateSupabaseClientParams = {}
): SupabaseClient<Database> {
  const env = params.env ?? (process.env as EnvLike);

  const url = params.url ?? requireEnv(env, "SUPABASE_URL");
  const key =
    params.key ?? requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createSupabasePublishableClient(
  params: CreateSupabaseClientParams = {}
): SupabaseClient<Database> {
  const env = params.env ?? (process.env as EnvLike);

  const url = params.url ?? requireEnv(env, "SUPABASE_URL");
  const key =
    params.key ??
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    requireEnv(env, "SUPABASE_PUBLISHABLE_KEY");

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
