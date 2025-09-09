'use client';

import { client } from '@supabase-api/client.gen';
import type { PropsWithChildren } from 'react';

import { SUPABASE } from '@/constants/supabase';
import { AuthProvider } from '@/contexts/AuthContext';
import { ENV } from '@/env';

export const ClientProvider = ({ children }: PropsWithChildren) => {
  const apiKey = ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  client.setConfig({
    baseUrl: SUPABASE.BASE_URL,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return <AuthProvider>{children}</AuthProvider>;
};
