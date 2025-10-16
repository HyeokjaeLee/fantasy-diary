import type { Tool } from '@/types/mcp';

import { characterTools } from './character-tools';
import { episodeTools } from './episode-tools';
import { placeTools } from './place-tools';

export const readDbTools: Tool[] = [
  ...episodeTools,
  ...characterTools,
  ...placeTools,
];
