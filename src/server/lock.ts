/*
  Distributed lock helper.
  - Uses Supabase table `locks` if Service Role is configured.
  - Falls back to per-instance in-memory lock (best-effort on serverless).

  Expected table (create this once in your Supabase DB):

  create table if not exists public.locks (
    name text primary key,
    owner uuid not null,
    expires_at timestamptz not null default now()
  );

  -- Optional: RLS off for simplicity if using Service Role client
  -- alter table public.locks enable row level security;
  -- (Service Role bypasses RLS; no policies are required.)
*/

import { supabaseServer } from '@/lib/supabaseServer';

type AcquireResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'busy' | 'unavailable' };

const MEM_KEY = Symbol.for('fantasy-diary.locks');
type MemLock = { owner: string; expiresAt: number };
const globalAny = globalThis as unknown as {
  [MEM_KEY]?: Map<string, MemLock>;
};

function getMemStore() {
  if (!globalAny[MEM_KEY]) globalAny[MEM_KEY] = new Map<string, MemLock>();

  return globalAny[MEM_KEY]!;
}

export async function acquireLock(
  name: string,
  ttlMs = 30_000,
): Promise<AcquireResult> {
  const token = crypto.randomUUID();
  const now = Date.now();

  // Prefer distributed lock via Supabase RPC. No fallback (strict single-run guarantee).
  if (!supabaseServer) return { ok: false, reason: 'unavailable' };
  try {
    const { data, error } = await supabaseServer.rpc('acquire_lock', {
      name,
      owner: token,
      ttl_ms: ttlMs,
    });
    if (error) return { ok: false, reason: 'unavailable' };
    if (data === true) return { ok: true, token };
    return { ok: false, reason: 'busy' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function releaseLock(name: string, token: string): Promise<void> {
  if (!supabaseServer) return;
  try {
    await supabaseServer.rpc('release_lock', { name, owner: token });
  } catch {
    // noop: on failure, TTL will eventually expire
  }
}

export async function extendLock(
  name: string,
  token: string,
  ttlMs = 30_000,
): Promise<boolean> {
  const now = Date.now();
  if (!supabaseServer) return false;
  try {
    const { data, error } = await supabaseServer.rpc('extend_lock', {
      name,
      owner: token,
      ttl_ms: ttlMs,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function runWithLock<T>(
  name: string,
  work: () => Promise<T>,
  options?: { ttlMs?: number; heartbeatMs?: number },
): Promise<
  | { ok: true; value: T }
  | { ok: false; reason: 'busy' | 'unavailable' }
> {
  const ttlMs = options?.ttlMs ?? 30_000;
  const heartbeatMs = options?.heartbeatMs ?? Math.max(5_000, Math.floor(ttlMs / 2));

  const res = await acquireLock(name, ttlMs);
  if (!res.ok) return { ok: false, reason: res.reason };

  const token = res.token;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    // Heartbeat to keep the lock alive while work runs
    timer = setInterval(() => {
      void extendLock(name, token, ttlMs);
    }, heartbeatMs);

    const value = await work();
    return { ok: true, value };
  } finally {
    if (timer) clearInterval(timer);
    await releaseLock(name, token);
  }
}
