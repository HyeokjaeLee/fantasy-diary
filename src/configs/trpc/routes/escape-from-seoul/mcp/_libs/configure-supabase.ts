import type { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';

import { supabaseServer } from '@/lib/supabaseServer';
import type { Database } from '@/supabase/database';

export const getSupabaseServiceRoleClient = (): SupabaseClient<Database> => {
  if (!supabaseServer) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SERVICE_ROLE env when fetching stories',
    });
  }

  return supabaseServer;
};
