import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { characterTools } from '@/app/api/escape-from-seoul/mcp/write-db/_libs/characterTools';
import { episodeTools } from '@/app/api/escape-from-seoul/mcp/write-db/_libs/episodeTools';
import { placeTools } from '@/app/api/escape-from-seoul/mcp/write-db/_libs/placeTools';
import { publicProcedure, router } from '@/configs/trpc/settings';
import type { Tool } from '@/types/mcp';

export const writeDbTools: Tool[] = [
  ...episodeTools,
  ...characterTools,
  ...placeTools,
];

const sanitizeTool = (tool: Tool): Omit<Tool, 'handler'> => {
  const { handler: _handler, ...rest } = tool;
  void _handler;

  return rest;
};

const zCallInput = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});

export const escapeFromSeoulWriteDbRouter = router({
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
