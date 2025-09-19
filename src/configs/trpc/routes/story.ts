import { publicProcedure, router } from '@/configs/trpc/settings';

export const story = router({
  generate: publicProcedure.mutation(async ({ ctx, input }) => {
    return {
      ok: true,
      content: 'Hello world',
    };
  }),
});
