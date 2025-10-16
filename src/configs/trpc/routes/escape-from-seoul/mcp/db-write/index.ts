import { TRPCError } from '@trpc/server';

import { publicProcedure, router } from '@/configs/trpc/settings';
import type { Tool } from '@/types/mcp';

import { zCallInput } from './schemas';
import { writeDbTools } from './tools';

const sanitizeTool = (tool: Tool): Omit<Tool, 'handler'> => {
  const { handler: _handler, ...rest } = tool;
  void _handler;

  return rest;
};

export const dbWrite = router({
  list: publicProcedure.query(() =>
    writeDbTools.map((tool) => sanitizeTool(tool)),
  ),
  execute: publicProcedure.input(zCallInput).mutation(async ({ input }) => {
    const tool = writeDbTools.find(
      (candidate) => candidate.name === input.name,
    );
    if (!tool) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `write-db tool ${input.name} not found`,
      });
    }

    const result = await tool.handler(input.arguments ?? {});

    return JSON.stringify(result);
  }),
});
