import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assert } from "es-toolkit";

import { Constants } from "@/__generated__/supabase";
import { assertEnv } from "@/utils";

import type { Database } from "./type";

type EnvLike = Record<string, string | undefined>;

type CreateSupabaseClientParams = {
  url?: string;
  key?: string;
  env?: EnvLike;
};

const schema = assertEnv(
  "SUPABASE_SCHEMA",
  Object.keys(Constants) as (keyof typeof Constants)[]
);

export function createSupabaseAdminClient(
  params: CreateSupabaseClientParams = {}
): SupabaseClient<Database> {
  const env = params.env ?? (process.env as EnvLike);

  const projectId = env.SUPABASE_PROJECT_ID;
  assert(projectId, "Missing required env: SUPABASE_PROJECT_ID");

  const url = params.url ?? `https://${projectId}.supabase.co`;

  const key =
    params.key ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  assert(
    key,
    "Missing required env: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY"
  );

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema },
  });
}

export function createSupabasePublishableClient(
  params: CreateSupabaseClientParams = {}
): SupabaseClient<Database> {
  const env = params.env ?? (process.env as EnvLike);

  const projectId = env.SUPABASE_PROJECT_ID;
  assert(projectId, "Missing required env: SUPABASE_PROJECT_ID");

  const url = params.url ?? `https://${projectId}.supabase.co`;

  const key =
    params.key ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  assert(
    key,
    "Missing required env: SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY"
  );

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema },
  });
}
