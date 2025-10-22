import { client } from '@generated/supabase/client.gen';

import { ENV } from '@/env';
import { assert } from '@/utils';

const url = (ENV.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const baseUrl = `${url}/rest/v1`;
const serviceRole = ENV.NEXT_SUPABASE_SERVICE_ROLE;

assert(url && serviceRole);

client.setConfig({
  baseUrl,
  headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
});

export * from '@generated/supabase/sdk.gen';
