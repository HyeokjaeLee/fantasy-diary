import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";

import {
  deleteCharacters,
  deleteEpisodes,
  deleteLocations,
} from "../repositories/novelRepository";

type ResetOptions = {
  novelId: string;
};

export async function resetNovelData(options: ResetOptions): Promise<void> {
  const client = createSupabaseAdminClient();

  await Promise.all([
    deleteEpisodes(client, options.novelId),
    deleteCharacters(client, options.novelId),
    deleteLocations(client, options.novelId),
  ]);
}
