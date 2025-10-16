import { router } from '@/configs/trpc/settings';

import { escapeFromSeoulEpisode } from './escape-from-seoul';
import { health } from './health';

export const apiRouter = router({
  escapeFromSeoulEpisode,
  health,
});

export type ApiRouter = typeof apiRouter;
