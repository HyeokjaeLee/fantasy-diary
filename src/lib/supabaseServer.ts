import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

import { ENV } from '@/env';
import type { Database } from '@/supabase/database';

// Server-side Supabase client using Service Role for administrative actions
export const supabaseServer: SupabaseClient<Database> | null = (() => {
  const url = ENV.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = ENV.NEXT_SUPABASE_SERVICE_ROLE;

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
})();
