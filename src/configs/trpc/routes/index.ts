import { router } from '@/configs/trpc/settings';

import { health } from './health';

export const apiRouter = router({
  health,
});

export type ApiRouter = typeof apiRouter;
