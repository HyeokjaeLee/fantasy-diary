import { z } from 'zod';

export const zPlaceDescribeArgs = z
  .object({
    textQuery: z.string().min(1).max(120).optional(),
    placeId: z.string().min(1).optional(),
    languageCode: z.string().min(2).max(20).optional(),
    regionCode: z.string().min(2).max(10).optional(),
    pageSize: z.number().int().min(1).max(10).optional(),
    includeReviews: z.boolean().optional(),
  })
  .refine(
    (value) =>
      typeof value.textQuery === 'string' || typeof value.placeId === 'string',
    {
      message: 'textQuery 또는 placeId 중 최소 하나는 필요합니다.',
      path: ['textQuery'],
    },
  );

export const zCallInput = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});
