import { createClient } from '@supabase/supabase-js';

import { ENV } from '@/env';

// Server-side Supabase client using Service Role for administrative actions
export const supabaseServer = (() => {
  const url = ENV.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = ENV.NEXT_SUPABASE_SERVICE_ROLE;

  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
})();

