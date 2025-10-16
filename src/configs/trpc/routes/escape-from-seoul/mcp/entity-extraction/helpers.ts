import { executeMcpToolViaTrpc } from '../../_lib/mcp-client';

/**
 * Fetch character from DB by name
 */
export async function fetchCharacterByName(name: string): Promise<{
  name: string;
  personality?: string;
  background?: string;
  appearance?: string;
  current_place?: string;
  relationships?: unknown;
  major_events?: string[];
  character_traits?: string[];
  current_status?: string;
  last_mentioned_episode_id?: string;
} | null> {
  try {
    const result = await executeMcpToolViaTrpc('characters_list', { name });
    const parsed = JSON.parse(result);
    const characters = Array.isArray(parsed) ? parsed : [];

    if (characters.length === 0) return null;

    return characters[0] as {
      name: string;
      personality?: string;
      background?: string;
      appearance?: string;
      current_place?: string;
      relationships?: unknown;
      major_events?: string[];
      character_traits?: string[];
      current_status?: string;
      last_mentioned_episode_id?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Fetch place from DB by name
 */
export async function fetchPlaceByName(name: string): Promise<{
  name: string;
  current_situation?: string;
  latitude?: number;
  longitude?: number;
  last_weather_condition?: string;
  last_weather_weather_condition?: string;
  last_mentioned_episode_id?: string;
} | null> {
  try {
    const result = await executeMcpToolViaTrpc('places_list', { name });
    const parsed = JSON.parse(result);
    const places = Array.isArray(parsed) ? parsed : [];

    if (places.length === 0) {
      return null;
    }

    return places[0] as {
      name: string;
      current_situation?: string;
      latitude?: number;
      longitude?: number;
      last_weather_condition?: string;
      last_weather_weather_condition?: string;
      last_mentioned_episode_id?: string;
    };
  } catch {
    return null;
  }
}
