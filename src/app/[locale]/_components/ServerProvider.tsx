import 'server-only';

import { client } from '@supabase-api/client.gen';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { PropsWithChildren } from 'react';

import { SUPABASE } from '@/constants/supabase';
import { ENV } from '@/env';

export const ServerProvider = async ({ children }: PropsWithChildren) => {
  const messages = await getMessages();

  client.setConfig({
    baseUrl: SUPABASE.BASE_URL,
    headers: {
      apikey: ENV.NEXT_SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${ENV.NEXT_SUPABASE_SERVICE_ROLE}`,
    },
  });

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
};
