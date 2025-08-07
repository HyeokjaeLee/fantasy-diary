'use client';

import type { ReactNode } from 'react';

import { AuthProvider } from '@/contexts/AuthContext';

interface ProvidersProps {
  children: ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => {
  return <AuthProvider>{children}</AuthProvider>;
};