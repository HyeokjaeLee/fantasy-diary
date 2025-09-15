'use client';

import { client } from '@supabase-api/client.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';

import { trpc, trpcClient } from '@/configs/trpc';
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

  const [queryClient] = useState(() => new QueryClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
};
