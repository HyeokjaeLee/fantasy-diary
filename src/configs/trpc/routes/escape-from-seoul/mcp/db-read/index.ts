import { TRPCError } from '@trpc/server';
import { omit } from 'es-toolkit';

import { publicProcedure, router } from '@/configs/trpc/settings';

import { zCallInput } from './schemas';
import { readDbTools } from './tools';

export const dbRead = router({
  list: publicProcedure.query(() =>
    readDbTools.map((tool) => omit(tool, ['handler'])),
  ),
  execute: publicProcedure.input(zCallInput).mutation(async ({ input }) => {
    const tool = readDbTools.find((candidate) => candidate.name === input.name);
    if (!tool) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `read-db tool ${input.name} not found`,
      });
    }

    const result = await tool.handler(input.arguments ?? {});

    return JSON.stringify(result);
  }),
});
