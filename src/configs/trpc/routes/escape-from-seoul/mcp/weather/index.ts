import { TRPCError } from '@trpc/server';
import { omit } from 'es-toolkit';

import { publicProcedure, router } from '@/configs/trpc/settings';

import { zCallInput } from './schemas';
import { weatherTools } from './tools';

export const weather = router({
  list: publicProcedure.query(() =>
    weatherTools.map((tool) => omit(tool, ['handler'])),
  ),
  execute: publicProcedure.input(zCallInput).mutation(async ({ input }) => {
    const tool = weatherTools.find(
      (candidate) => candidate.name === input.name,
    );
    if (!tool) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `weather tool ${input.name} not found`,
      });
    }

    const result = await tool.handler(input.arguments ?? {});

    return JSON.stringify(result);
  }),
});
