import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';

// Extend this when you add auth/session to context
export const createContext = async (opts: FetchCreateContextFnOptions | null) => {
  const headers = opts?.req.headers;
  const isClient = headers?.get('isClient') === 'true' || false;

  return { isClient, headers };
};

const t = initTRPC.context<typeof createContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCaller = t.createCallerFactory;
export const publicProcedure = t.procedure;
