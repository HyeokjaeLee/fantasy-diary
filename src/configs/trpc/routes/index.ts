import { router } from '@/configs/trpc/settings';

import { health } from './health';
import { story } from './story';

export const apiRouter = router({
  health,
  story,
});

export type ApiRouter = typeof apiRouter;
