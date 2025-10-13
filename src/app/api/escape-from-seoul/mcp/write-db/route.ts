import { handleMcpRequest } from '@/utils';

import { characterTools } from './_libs/characterTools';
import { episodeTools } from './_libs/episodeTools';
import { placeTools } from './_libs/placeTools';

export async function POST(req: Request) {
  return handleMcpRequest({
    req,
    tools: [...episodeTools, ...characterTools, ...placeTools],
  });
}
