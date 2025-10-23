import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@supabase-api/database.types';

import { ENV } from '@/env';

export const supabase = createClient<Database>(
  ENV.NEXT_PUBLIC_SUPABASE_URL,
  ENV.NEXT_SUPABASE_SERVICE_ROLE,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
