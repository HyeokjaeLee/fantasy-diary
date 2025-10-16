import { client } from '@supabase-api/client.gen';
import { TRPCError } from '@trpc/server';

import { ENV } from '@/env';

export const configureSupabaseRest = () => {
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
