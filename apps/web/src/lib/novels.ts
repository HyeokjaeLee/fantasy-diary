import { createSupabasePublishableClient } from '@fantasy-diary/shared/supabase';
import type { Tables } from '@fantasy-diary/shared/supabase/type';

export type Novel = Tables<{ schema: 'dev' }, 'novels'>;
export type Episode = Tables<{ schema: 'dev' }, 'episodes'>;
export type NovelEpisodeGroup = {
  novel: Novel;
  episodes: Episode[];
};

export async function fetchRecentNovels() {
  const supabase = createSupabasePublishableClient();

  const { data, error } = await supabase
    .from('novels')
    .select('id, title, genre, status, created_at')
    .order('created_at', { ascending: false })
    .limit(24);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchNovelDetail(novelId: string) {
  const supabase = createSupabasePublishableClient();

  const { data, error } = await supabase
    .from('novels')
    .select('*')
    .eq('id', novelId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function fetchAllNovelEpisodeGroups(): Promise<NovelEpisodeGroup[]> {
  const supabase = createSupabasePublishableClient();

  const { data: novels, error: novelError } = await supabase
    .from('novels')
    .select('*')
    .order('created_at', { ascending: false });

  if (novelError) {
    throw new Error(novelError.message);
  }

  const { data: episodes, error: episodeError } = await supabase
    .from('episodes')
    .select('*')
    .order('novel_id', { ascending: true })
    .order('episode_number', { ascending: true });

  if (episodeError) {
    throw new Error(episodeError.message);
  }

  const episodeMap = new Map<string, Episode[]>();
  for (const episode of episodes ?? []) {
    const list = episodeMap.get(episode.novel_id);
    if (list) {
      list.push(episode);
      continue;
    }
    episodeMap.set(episode.novel_id, [episode]);
  }

  return (novels ?? []).map((novel) => ({
    novel,
    episodes: episodeMap.get(novel.id) ?? [],
  }));
}

export async function fetchEpisodeDetail(episodeId: string) {
  const supabase = createSupabasePublishableClient();

  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', episodeId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
