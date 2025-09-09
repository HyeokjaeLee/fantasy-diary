import { createClient } from '@supabase/supabase-js';

import { ENV } from '@/env';

const supabaseUrl = ENV.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
