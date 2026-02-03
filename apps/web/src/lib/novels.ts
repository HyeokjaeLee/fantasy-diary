import { createSupabasePublishableClient } from '@fantasy-diary/shared/supabase';
import type { Tables } from '@fantasy-diary/shared/supabase/type';

export type Novel = Tables<'novels'>;
export type Episode = Tables<'episodes'>;

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

export async function fetchRecentEpisodes() {
  const supabase = createSupabasePublishableClient();

  const { data, error } = await supabase
    .from('episodes')
    .select('id, novel_id, episode_number, body, created_at')
    .order('created_at', { ascending: false })
    .limit(24);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
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
