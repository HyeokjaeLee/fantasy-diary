import { createSupabasePublishableClient } from '@fantasy-diary/shared/supabase';
import type { Tables } from '@fantasy-diary/shared/supabase/type';

export type Episode = Tables<'episodes'>;

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
    .select('id, novel_id, episode_number, body, created_at')
    .eq('id', episodeId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
