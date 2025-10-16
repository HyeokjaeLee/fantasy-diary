import { z } from 'zod';

export const zCallInput = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});
