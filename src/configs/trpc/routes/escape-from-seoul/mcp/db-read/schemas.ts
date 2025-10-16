import { z } from 'zod';

export const zListArgs = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const zEpisodeId = z.object({ id: z.string().min(1) });

export const zNameLookup = z.object({ name: z.string().min(1) });

export const zCallInput = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});
