import { publicProcedure, router } from '@/configs/trpc/settings';

export const health = router({
  ping: publicProcedure.query(() => 'pong'),
});
