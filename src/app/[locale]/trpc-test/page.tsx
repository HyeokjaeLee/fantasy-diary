'use client';

import { trpc } from '@/configs/trpc';

export default function TrpcTestPage() {
  const { data, isLoading, error } = trpc.health.ping.useQuery();

  if (isLoading) return <div>loading...</div>;
  if (error) return <div>error: {String(error.message)}</div>;

  return <div>trpc health: {data}</div>;
}
