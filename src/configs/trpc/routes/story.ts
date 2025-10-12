import { client } from '@supabase-api/client.gen';
import { getEscapeFromSeoulEpisodes } from '@supabase-api/sdk.gen';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { WriteChapterResponse } from '@/app/api/escape-from-seoul/types/novel';
import { publicProcedure, router } from '@/configs/trpc/settings';
import { ENV } from '@/env';

const configureSupabaseRest = () => {
  const url = (ENV.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const baseUrl = `${url}/rest/v1`;
  const serviceRole = ENV.NEXT_SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SERVICE_ROLE env when fetching stories',
    });
  }

  client.setConfig({
    baseUrl,
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  });
};

export const story = router({
  latest: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      configureSupabaseRest();
      const limit = input?.limit ?? 10;
      const { data, error } = await getEscapeFromSeoulEpisodes({
        headers: { Prefer: 'count=none' },
        query: { order: 'id.desc', limit: String(limit) },
      });
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: String(error),
        });
      }

      return Array.isArray(data) ? data : [];
    }),
  generate: publicProcedure
    .input(
      z.object({
        topic: z.string().min(1),
        style: z.string().min(1),
        length: z.string().min(1),
        chapters: z.number().int().min(1).max(10),
      }),
    )
    .mutation(async ({ input }) => {
      const baseUrl = ENV.NEXT_PUBLIC_URL;
      if (!baseUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Missing NEXT_PUBLIC_URL env when generating story',
        });
      }

      const response = await fetch(`${baseUrl}/api/escape-from-seoul`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentTime: new Date().toISOString() }),
      });

      if (!response.ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to generate chapter: ${response.statusText}`,
        });
      }

      const payload = (await response.json()) as WriteChapterResponse;
      if (!payload.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: payload.error ?? 'Unknown chapter generation error',
        });
      }

      return {
        content: payload.content,
        saved: {
          chapterId: payload.chapterId,
          stats: payload.stats,
          request: input,
        },
      };
    }),
});
