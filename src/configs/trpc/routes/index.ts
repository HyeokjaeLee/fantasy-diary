import { router } from '@/configs/trpc/settings';

import { escapeFromSeoulRouter } from './escape-from-seoul';
import { health } from './health';

export const apiRouter = router({
  escapeFromSeoul: escapeFromSeoulRouter,
  health,
});

export type ApiRouter = typeof apiRouter;
