import { z } from 'zod';

import { publicProcedure, router } from '@/configs/trpc/settings';
import { generateEscapeFromSeoulChapter } from '@/server/escape-from-seoul/generateChapter';

import { escapeFromSeoulGoogleRouter } from './mcp/google';
import { escapeFromSeoulReadDbRouter } from './mcp/readDb';
import { escapeFromSeoulWeatherRouter } from './mcp/weather';
import { escapeFromSeoulWriteDbRouter } from './mcp/writeDb';

const zGenerateChapterInput = z.object({
  currentTime: z.string().min(1),
});

export const escapeFromSeoulMcpRouter = router({
  google: escapeFromSeoulGoogleRouter,
  readDb: escapeFromSeoulReadDbRouter,
  weather: escapeFromSeoulWeatherRouter,
  writeDb: escapeFromSeoulWriteDbRouter,
});

export const escapeFromSeoulRouter = router({
  generateChapter: publicProcedure
    .input(zGenerateChapterInput)
    .mutation(async ({ input }) => generateEscapeFromSeoulChapter(input)),
  mcp: escapeFromSeoulMcpRouter,
});
