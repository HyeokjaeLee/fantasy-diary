import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseServer } from '@/lib/supabaseServer';
import type { Database } from '@/supabase/database';

const adminClient: SupabaseClient<Database> | null = supabaseServer;

if (!adminClient) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_SUPABASE_SERVICE_ROLE env when creating Supabase admin client',
  );
}

export const supabaseAdminClient = adminClient;
