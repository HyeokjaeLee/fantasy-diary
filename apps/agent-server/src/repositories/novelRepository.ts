import type { Database } from "@fantasy-diary/shared/supabase/type";
import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

import { AgentError } from "../errors/agentError";

export type NovelRow = Database["public"]["Tables"]["novels"]["Row"];
export type EpisodeRow = Database["public"]["Tables"]["episodes"]["Row"];
export type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];
export type LocationRow = Database["public"]["Tables"]["locations"]["Row"];

export type EpisodeInsert = Database["public"]["Tables"]["episodes"]["Insert"];
export type CharacterInsert = Database["public"]["Tables"]["characters"]["Insert"];
export type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];

export type EpisodeCharacterInsert =
  Database["public"]["Tables"]["episode_characters"]["Insert"];
export type EpisodeLocationInsert =
  Database["public"]["Tables"]["episode_locations"]["Insert"];

function ensureSingle<T>(
  response: PostgrestSingleResponse<T>,
  errorCode: "QUERY_FAILED" | "INSERT_FAILED" | "UPDATE_FAILED" | "DELETE_FAILED",
  message: string
): T {
  if (response.error) {
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: errorCode as "QUERY_FAILED",
      message: message,
      details: {
        error: response.error.message,
      },
    });
  }

  if (!response.data) {
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: errorCode as "QUERY_FAILED",
      message: message,
    });
  }

  return response.data;
}

function ensureArray<T>(
  response: PostgrestSingleResponse<T[]>,
  errorCode: "QUERY_FAILED" | "INSERT_FAILED" | "UPDATE_FAILED" | "DELETE_FAILED",
  message: string
): T[] {
  if (response.error) {
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: errorCode as "QUERY_FAILED",
      message: message,
      details: {
        error: response.error.message,
      },
    });
  }

  return response.data ?? [];
}

export async function fetchNovel(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<NovelRow> {
  const response = await client.from("novels").select("*").eq("id", novelId).single();

  return ensureSingle(response, "QUERY_FAILED", "Failed to fetch novel");
}

export async function fetchEpisodes(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<EpisodeRow[]> {
  const response = await client
    .from("episodes")
    .select("*")
    .eq("novel_id", novelId)
    .order("episode_number", { ascending: true });

  return ensureArray(response, "QUERY_FAILED", "Failed to fetch episodes");
}

export async function fetchCharacters(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<CharacterRow[]> {
  const response = await client
    .from("characters")
    .select("*")
    .eq("novel_id", novelId)
    .order("name", { ascending: true });

  return ensureArray(response, "QUERY_FAILED", "Failed to fetch characters");
}

export async function fetchLocations(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<LocationRow[]> {
  const response = await client
    .from("locations")
    .select("*")
    .eq("novel_id", novelId)
    .order("name", { ascending: true });

  return ensureArray(response, "QUERY_FAILED", "Failed to fetch locations");
}

export async function insertEpisode(
  client: SupabaseClient<Database>,
  input: EpisodeInsert
): Promise<EpisodeRow> {
  const response = await client.from("episodes").insert(input).select("*").single();

  return ensureSingle(response, "INSERT_FAILED", "Failed to insert episode");
}

export async function upsertCharacters(
  client: SupabaseClient<Database>,
  inputs: CharacterInsert[]
): Promise<CharacterRow[]> {
  if (inputs.length === 0) return [];

  const response = await client
    .from("characters")
    .upsert(inputs, { onConflict: "novel_id,name" })
    .select("*");

  return ensureArray(response, "INSERT_FAILED", "Failed to upsert characters");
}

export async function upsertLocations(
  client: SupabaseClient<Database>,
  inputs: LocationInsert[]
): Promise<LocationRow[]> {
  if (inputs.length === 0) return [];

  const response = await client
    .from("locations")
    .upsert(inputs, { onConflict: "novel_id,name" })
    .select("*");

  return ensureArray(response, "INSERT_FAILED", "Failed to upsert locations");
}

export async function upsertEpisodeCharacters(
  client: SupabaseClient<Database>,
  inputs: EpisodeCharacterInsert[]
): Promise<void> {
  if (inputs.length === 0) return;

  const response = await client
    .from("episode_characters")
    .upsert(inputs, { onConflict: "episode_id,character_id" })
    .select("id");

  ensureArray(response, "INSERT_FAILED", "Failed to upsert episode characters");
}

export async function upsertEpisodeLocations(
  client: SupabaseClient<Database>,
  inputs: EpisodeLocationInsert[]
): Promise<void> {
  if (inputs.length === 0) return;

  const response = await client
    .from("episode_locations")
    .upsert(inputs, { onConflict: "episode_id,location_id" })
    .select("id");

  ensureArray(response, "INSERT_FAILED", "Failed to upsert episode locations");
}

export type NovelUpdate = Database["public"]["Tables"]["novels"]["Update"];

export async function updateNovel(
  client: SupabaseClient<Database>,
  novelId: string,
  updates: NovelUpdate
): Promise<NovelRow> {
  const response = await client
    .from("novels")
    .update(updates)
    .eq("id", novelId)
    .select("*")
    .single();

  return ensureSingle(response, "UPDATE_FAILED", "Failed to update novel");
}

export async function deleteEpisodes(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<void> {
  const response = await client
    .from("episodes")
    .delete()
    .eq("novel_id", novelId);

  if (response.error) {
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "DELETE_FAILED",
      message: "Failed to delete episodes",
      details: {
        error: response.error.message,
      },
    });
  }
}

export async function deleteCharacters(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<void> {
  const response = await client
    .from("characters")
    .delete()
    .eq("novel_id", novelId);

  if (response.error) {
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "DELETE_FAILED",
      message: "Failed to delete characters",
      details: {
        error: response.error.message,
      },
    });
  }
}

export async function deleteLocations(
  client: SupabaseClient<Database>,
  novelId: string
): Promise<void> {
  const response = await client
    .from("locations")
    .delete()
    .eq("novel_id", novelId);

  if (response.error) {
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "DELETE_FAILED",
      message: "Failed to delete locations",
      details: {
        error: response.error.message,
      },
    });
  }
}
