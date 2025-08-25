import { type DynamicRoute } from 'next-typesafe-url';
import { z } from 'zod';

import { locales } from '@/types/i18n';

export const Route = {
  routeParams: z.object({
    locale: z.enum(locales),
  }),
} satisfies DynamicRoute;
export type RouteType = typeof Route;
