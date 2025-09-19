import { supabaseServer } from '@/lib/supabaseServer';

type AcquireResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'busy' | 'unavailable' };

const MEM_KEY = Symbol.for('fantasy-diary.locks');
type MemLock = { owner: string; expiresAt: number };
const globalAny = globalThis as unknown as {
  [MEM_KEY]?: Map<string, MemLock>;
};

function getMemLocks(): Map<string, MemLock> {
  if (!globalAny[MEM_KEY]) globalAny[MEM_KEY] = new Map<string, MemLock>();

  return globalAny[MEM_KEY]!;
}

function tryAcquireMemLock(name: string, ttlMs: number, owner: string): AcquireResult {
  const now = Date.now();
  const locks = getMemLocks();
  const cur = locks.get(name);
  if (cur && cur.expiresAt > now) return { ok: false, reason: 'busy' };
  locks.set(name, { owner, expiresAt: now + ttlMs });

  return { ok: true, token: owner };
}

export async function acquireLock(
  name: string,
  ttlMs = 30_000,
): Promise<AcquireResult> {
  const token = crypto.randomUUID();

  // Prefer distributed lock via Supabase RPC. Fallback to in-memory lock if unavailable.
  if (!supabaseServer) return tryAcquireMemLock(name, ttlMs, token);
  try {
    const { data, error } = await supabaseServer.rpc('acquire_lock', {
      name,
      owner: token,
      ttl_ms: ttlMs,
    });
    if (error) return tryAcquireMemLock(name, ttlMs, token);
    if (data === true) return { ok: true, token };

    return { ok: false, reason: 'busy' };
  } catch {
    return tryAcquireMemLock(name, ttlMs, token);
  }
}

export async function releaseLock(name: string, token: string): Promise<void> {
  if (!supabaseServer) {
    const locks = getMemLocks();
    const cur = locks.get(name);
    if (cur && cur.owner === token) locks.delete(name);

    return;
  }
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
  if (!supabaseServer) {
    const locks = getMemLocks();
    const cur = locks.get(name);
    if (!cur || cur.owner !== token) return false;
    cur.expiresAt = Date.now() + ttlMs;
    locks.set(name, cur);

    return true;
  }
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
  { ok: true; value: T } | { ok: false; reason: 'busy' | 'unavailable' }
> {
  const ttlMs = options?.ttlMs ?? 30_000;
  const heartbeatMs =
    options?.heartbeatMs ?? Math.max(5_000, Math.floor(ttlMs / 2));

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
