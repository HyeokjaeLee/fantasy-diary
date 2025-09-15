import { TRPCError } from '@trpc/server';

import { publicProcedure, router } from '@/configs/trpc/settings';
import { runWithLock } from '@/server/lock';

export const health = router({
  // Ensures only one execution at a time across instances (with Supabase),
  // otherwise returns a 409 CONFLICT when already running.
  ping: publicProcedure.query(async () => {
    const lockName = 'trpc:health:ping';
    const res = await runWithLock(
      lockName,
      async () => {
        // 실제 로직이 짧더라도, runWithLock이 작업 동안 TTL을 주기적으로 갱신합니다.
        return 'pong';
      },
      { ttlMs: 30_000, heartbeatMs: 10_000 },
    );

    if (!res.ok) {
      if (res.reason === 'busy') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'health.ping already running',
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Lock backend unavailable',
      });
    }

    return res.value;
  }),
  // 장시간 작업 예시: 10초 동안 작업을 수행하며, 락을 유지(heartbeat)합니다.
  long: publicProcedure.query(async () => {
    const lockName = 'trpc:health:long';
    const res = await runWithLock(
      lockName,
      async () => {
        await new Promise((r) => setTimeout(r, 10_000));

        return 'done';
      },
      { ttlMs: 45_000, heartbeatMs: 10_000 },
    );

    if (!res.ok) {
      if (res.reason === 'busy') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'health.long already running',
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Lock backend unavailable',
      });
    }

    return res.value;
  }),
});
