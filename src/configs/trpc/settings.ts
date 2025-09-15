import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';

// Extend this when you add auth/session to context
export const createContext = async (_opts: FetchCreateContextFnOptions | null) => {
  return {} as Record<string, never>;
};

const t = initTRPC.context<typeof createContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const createCaller = t.createCallerFactory;
export const publicProcedure = t.procedure;
