import { ENV } from '@/env';

export const SUPABASE = {
  BASE_URL: `${ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/rest/v1`,
};
