import type { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import type { Database, TablesInsert } from "@fantasy-diary/shared/supabase/type";
import { SupabaseZod } from "@fantasy-diary/shared/supabase/zod";

import { geminiEmbedText, vectorLiteral } from "../gemini";

const allowedDbTables = [
  "novels",
  "episodes",
  "characters",
  "locations",
  "plot_seeds",
  "plot_seed_characters",
  "plot_seed_locations",
  "episode_chunks",
] as const satisfies ReadonlyArray<keyof Database["public"]["Tables"]>;

type AllowedDbTable = (typeof allowedDbTables)[number];

type SupabaseFilter =
  | { column: string; op: "eq" | "gte" | "lte" | "like" | "ilike"; value: string }
  | { column: string; op: "in"; value: string[] };

type DbSelectArgs = {
  table: AllowedDbTable;
  select?: string;
  filters?: SupabaseFilter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
};

type RagSearchSummariesArgs = {
  novel_id: string;
  query: string;
  max_episode_no: number;
  match_count?: number;
};

type RagSearchChunksArgs = {
  novel_id: string;
  query: string;
  chunk_kind: "episode" | "fact" | "style";
  max_episode_no: number;
  match_count?: number;
};

type UpsertCharacterArgs = Pick<
  TablesInsert<"characters">,
  "novel_id" | "name" | "personality" | "gender" | "birthday"
>;

const UpsertCharacterArgsSchema = SupabaseZod.public.Tables.characters.Insert.pick({
  novel_id: true,
  name: true,
  personality: true,
  gender: true,
  birthday: true,
}).strict();

type UpsertLocationArgs = Pick<
  TablesInsert<"locations">,
  "novel_id" | "name" | "situation"
>;

const UpsertLocationArgsSchema = SupabaseZod.public.Tables.locations.Insert.pick({
  novel_id: true,
  name: true,
  situation: true,
}).strict();

type InsertPlotSeedArgs = Pick<
  TablesInsert<"plot_seeds">,
  "novel_id" | "title" | "detail" | "introduced_in_episode_id"
> & {
  character_names?: string[];
  location_names?: string[];
};

const InsertPlotSeedArgsSchema = SupabaseZod.public.Tables.plot_seeds.Insert.pick({
  novel_id: true,
  title: true,
  detail: true,
  introduced_in_episode_id: true,
}).strict();

function toRequiredString(value: unknown, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new Error(`${label} is required`);

  return trimmed;
}

function isEpisodeChunksEmbeddingSelected(select?: string): boolean {
  const selection = (select ?? "*").replaceAll(" ", "");
  if (selection === "*") return true;

  return selection.split(",").some((part) => part === "embedding");
}

export async function dbSelect(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  params: DbSelectArgs
): Promise<unknown> {
  if (!allowedDbTables.includes(params.table)) {
    throw new Error(`db_select: unsupported table: ${String(params.table)}`);
  }

  if (typeof params.select === "string" && params.select.length > 500) {
    throw new Error("db_select: select string too long");
  }

  if (
    params.table === "episode_chunks" &&
    isEpisodeChunksEmbeddingSelected(params.select)
  ) {
    throw new Error(
      "episode_chunks.embedding is not selectable via tool (too large); select other columns"
    );
  }

  let query = supabase.from(params.table).select(params.select ?? "*");

  for (const filter of params.filters ?? []) {
    if (filter.op === "in") {
      query = query.in(filter.column, filter.value);
      continue;
    }

    if (filter.op === "eq") query = query.eq(filter.column, filter.value);
    if (filter.op === "gte") query = query.gte(filter.column, filter.value);
    if (filter.op === "lte") query = query.lte(filter.column, filter.value);
    if (filter.op === "like") query = query.like(filter.column, filter.value);
    if (filter.op === "ilike") query = query.ilike(filter.column, filter.value);
  }

  if (params.order) {
    query = query.order(params.order.column, {
      ascending: params.order.ascending !== false,
    });
  }

  const requestedLimit = typeof params.limit === "number" ? params.limit : 20;
  const cappedLimit = Math.max(1, Math.min(50, requestedLimit));

  if (params.table === "episodes") {
    const select = params.select ?? "*";
    const selectingContent = select.includes("*") || select.includes("content");
    query = query.limit(selectingContent ? Math.min(10, cappedLimit) : cappedLimit);
  } else {
    query = query.limit(cappedLimit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`db_select: ${error.message}`);

  return data;
}

export async function ragSearchSummaries(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  geminiApiKey: string;
  geminiEmbeddingModel: string;
  ragEmbeddingModelId: string;
  args: RagSearchSummariesArgs;
}): Promise<unknown> {
  if (!params.args.novel_id)
    throw new Error("rag_search_summaries: novel_id is required");
  if (!params.args.query || params.args.query.trim().length === 0)
    throw new Error("rag_search_summaries: query is required");
  if (!Number.isFinite(params.args.max_episode_no) || params.args.max_episode_no < 0)
    throw new Error("rag_search_summaries: max_episode_no must be >= 0");

  const embedding = await geminiEmbedText({
    apiKey: params.geminiApiKey,
    model: params.geminiEmbeddingModel,
    text: params.args.query,
  });

  const { data, error } = await params.supabase.rpc("match_episode_summaries", {
    p_novel_id: params.args.novel_id,
    p_query_embedding: vectorLiteral(embedding),
    p_max_episode_no: params.args.max_episode_no,
    p_match_count: params.args.match_count ?? 30,
    p_embedding_model: params.ragEmbeddingModelId,
  });

  if (error) throw new Error(`rag_search_summaries: ${error.message}`);

  return data;
}

export async function ragSearchChunks(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  geminiApiKey: string;
  geminiEmbeddingModel: string;
  ragEmbeddingModelId: string;
  args: RagSearchChunksArgs;
}): Promise<unknown> {
  if (!params.args.novel_id)
    throw new Error("rag_search_chunks: novel_id is required");
  if (!params.args.query || params.args.query.trim().length === 0)
    throw new Error("rag_search_chunks: query is required");
  if (!Number.isFinite(params.args.max_episode_no) || params.args.max_episode_no < 0)
    throw new Error("rag_search_chunks: max_episode_no must be >= 0");

  const allowedKinds: RagSearchChunksArgs["chunk_kind"][] = [
    "episode",
    "fact",
    "style",
  ];

  if (!allowedKinds.includes(params.args.chunk_kind))
    throw new Error(
      `rag_search_chunks: invalid chunk_kind: ${params.args.chunk_kind}`
    );

  const embedding = await geminiEmbedText({
    apiKey: params.geminiApiKey,
    model: params.geminiEmbeddingModel,
    text: params.args.query,
  });

  const { data, error } = await params.supabase.rpc("match_episode_chunks", {
    p_novel_id: params.args.novel_id,
    p_query_embedding: vectorLiteral(embedding),
    p_chunk_kind: params.args.chunk_kind,
    p_max_episode_no: params.args.max_episode_no,
    p_match_count: params.args.match_count ?? 10,
    p_embedding_model: params.ragEmbeddingModelId,
  });

  if (error) throw new Error(`rag_search_chunks: ${error.message}`);

  return data;
}

export async function upsertCharacter(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  args: UpsertCharacterArgs;
}): Promise<{ id: string; name: string }> {
  const parsed = UpsertCharacterArgsSchema.parse({
    ...params.args,
    novel_id: params.args.novel_id.trim(),
    birthday: params.args.birthday.trim(),
  });

  const novelId = parsed.novel_id;
  const name = parsed.name.trim();

  if (!name) throw new Error("upsert_character: name is required");

  const personality = toRequiredString(
    parsed.personality,
    "upsert_character: personality"
  );
  const gender = parsed.gender;
  const birthday = toRequiredString(parsed.birthday, "upsert_character: birthday");

  const { data: existing, error: existingError } = await params.supabase
    .from("characters")
    .select("id,name")
    .eq("novel_id", novelId)
    .eq("name", name)
    .limit(1);

  if (existingError) throw new Error(`upsert_character: ${existingError.message}`);

  const current = existing?.[0];

  if (!current) {
    const { data, error } = await params.supabase
      .from("characters")
      .insert({
        novel_id: novelId,
        name,
        personality,
        gender,
        birthday,
      })
      .select("id,name")
      .single();

    if (error) throw new Error(`upsert_character: ${error.message}`);
    if (!data) throw new Error("upsert_character: insert failed");

    return data;
  }

  const { data, error } = await params.supabase
    .from("characters")
    .update({ personality, gender, birthday })
    .eq("id", current.id)
    .select("id,name")
    .single();

  if (error) throw new Error(`upsert_character: ${error.message}`);
  if (!data) throw new Error("upsert_character: update failed");

  return data;
}

export async function upsertLocation(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  args: UpsertLocationArgs;
}): Promise<{ id: string; name: string }> {
  const parsed = UpsertLocationArgsSchema.parse({
    ...params.args,
    novel_id: params.args.novel_id.trim(),
  });

  const novelId = parsed.novel_id;
  const name = parsed.name.trim();

  const situation = toRequiredString(parsed.situation, "upsert_location: situation");

  if (!name) throw new Error("upsert_location: name is required");

  const { data: existing, error: existingError } = await params.supabase
    .from("locations")
    .select("id,name")
    .eq("novel_id", novelId)
    .eq("name", name)
    .limit(1);

  if (existingError) throw new Error(`upsert_location: ${existingError.message}`);

  const current = existing?.[0];

  if (!current) {
    const { data, error } = await params.supabase
      .from("locations")
      .insert({
        novel_id: novelId,
        name,
        situation,
      })
      .select("id,name")
      .single();

    if (error) throw new Error(`upsert_location: ${error.message}`);
    if (!data) throw new Error("upsert_location: insert failed");

    return data;
  }

  const { data, error } = await params.supabase
    .from("locations")
    .update({ situation })
    .eq("id", current.id)
    .select("id,name")
    .single();

  if (error) throw new Error(`upsert_location: ${error.message}`);
  if (!data) throw new Error("upsert_location: update failed");

  return data;
}

export async function insertPlotSeed(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  args: InsertPlotSeedArgs;
}): Promise<{ id: string; title: string; status: string }> {
  const rawIntroducedInEpisodeId = params.args.introduced_in_episode_id;

  const parsed = InsertPlotSeedArgsSchema.parse({
    novel_id: params.args.novel_id.trim(),
    title: params.args.title,
    detail: params.args.detail,
    introduced_in_episode_id:
      typeof rawIntroducedInEpisodeId === "string"
        ? rawIntroducedInEpisodeId.trim() || undefined
        : rawIntroducedInEpisodeId,
  });

  const novelId = parsed.novel_id;
  const title = parsed.title.trim();
  const detail = parsed.detail.trim();

  if (!title) throw new Error("insert_plot_seed: title is required");
  if (!detail) throw new Error("insert_plot_seed: detail is required");

  const introducedInEpisodeId = parsed.introduced_in_episode_id ?? null;

  const { data: existing, error: existingError } = await params.supabase
    .from("plot_seeds")
    .select("id,title,status,detail,introduced_in_episode_id")
    .eq("novel_id", novelId)
    .eq("title", title)
    .eq("status", "open")
    .limit(1);

  if (existingError)
    throw new Error(`insert_plot_seed: select existing: ${existingError.message}`);

  const current = existing?.[0];

  let data: { id: string; title: string; status: string };

  if (!current) {
    const { data: inserted, error } = await params.supabase
      .from("plot_seeds")
      .insert({
        novel_id: novelId,
        title,
        detail,
        status: "open",
        introduced_in_episode_id: introducedInEpisodeId,
      })
      .select("id,title,status")
      .single();

    if (error) throw new Error(`insert_plot_seed: ${error.message}`);
    if (!inserted) throw new Error("insert_plot_seed: insert failed");

    data = inserted;
  } else {
    const patch: Record<string, unknown> = {};

    if (typeof current.detail === "string" && current.detail !== detail) {
      patch.detail = detail;
    }

    if (!current.introduced_in_episode_id && introducedInEpisodeId) {
      patch.introduced_in_episode_id = introducedInEpisodeId;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await params.supabase
        .from("plot_seeds")
        .update(patch)
        .eq("id", current.id);

      if (error) throw new Error(`insert_plot_seed: update existing: ${error.message}`);
    }

    data = { id: current.id, title: current.title, status: current.status };
  }

  const characterNames = Array.from(
    new Set((params.args.character_names ?? []).map((n) => n.trim()).filter(Boolean))
  );
  const locationNames = Array.from(
    new Set((params.args.location_names ?? []).map((n) => n.trim()).filter(Boolean))
  );

  if (characterNames.length > 0) {
    const { data: characters, error: characterError } = await params.supabase
      .from("characters")
      .select("id,name")
      .eq("novel_id", novelId)
      .in("name", characterNames);

    if (characterError)
      throw new Error(`insert_plot_seed: load characters: ${characterError.message}`);

    const rows = (characters ?? []).map((c) => ({
      plot_seed_id: data.id,
      character_id: c.id,
    }));

    if (rows.length > 0) {
      const { error: linkError } = await params.supabase
        .from("plot_seed_characters")
        .upsert(rows, { onConflict: "plot_seed_id,character_id" });

      if (linkError)
        throw new Error(
          `insert_plot_seed: link characters: ${linkError.message}`
        );
    }
  }

  if (locationNames.length > 0) {
    const { data: locations, error: locationError } = await params.supabase
      .from("locations")
      .select("id,name")
      .eq("novel_id", novelId)
      .in("name", locationNames);

    if (locationError)
      throw new Error(`insert_plot_seed: load locations: ${locationError.message}`);

    const rows = (locations ?? []).map((l) => ({
      plot_seed_id: data.id,
      location_id: l.id,
    }));

    if (rows.length > 0) {
      const { error: linkError } = await params.supabase
        .from("plot_seed_locations")
        .upsert(rows, { onConflict: "plot_seed_id,location_id" });

      if (linkError)
        throw new Error(`insert_plot_seed: link locations: ${linkError.message}`);
    }
  }

  return data;
}

export async function getNextEpisodeNo(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
}): Promise<number> {
  const { data, error } = await params.supabase
    .from("episodes")
    .select("episode_no")
    .eq("novel_id", params.novelId)
    .order("episode_no", { ascending: false })
    .limit(1);

  if (error) throw new Error(`getNextEpisodeNo: ${error.message}`);

  const last = data?.[0]?.episode_no;

  return typeof last === "number" ? last + 1 : 1;
}

export async function insertEpisode(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
  episodeNo: number;
  storyTime: string;
  episodeContent: string;
}): Promise<{ id: string; episode_no: number }> {
  const { data, error } = await params.supabase
    .from("episodes")
    .insert({
      novel_id: params.novelId,
      episode_no: params.episodeNo,
      story_time: params.storyTime,
      content: params.episodeContent,
    })
    .select("id,episode_no")
    .single();

  if (error) throw new Error(`insertEpisode: ${error.message}`);
  if (!data) throw new Error("insertEpisode: insert failed");

  return data;
}

export async function markPlotSeedsIntroduced(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
  episodeId: string;
  plotSeedIds: string[];
}): Promise<void> {
  const ids = Array.from(new Set(params.plotSeedIds)).filter((id) => id.trim().length > 0);
  if (ids.length === 0) return;

  const { error } = await params.supabase
    .from("plot_seeds")
    .update({ introduced_in_episode_id: params.episodeId })
    .eq("novel_id", params.novelId)
    .is("introduced_in_episode_id", null)
    .in("id", ids);

  if (error) throw new Error(`markPlotSeedsIntroduced: ${error.message}`);
}

export async function indexEpisodeSummary(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
  episodeId: string;
  episodeNo: number;
  episodeContent: string;
  geminiApiKey: string;
  geminiEmbeddingModel: string;
  ragEmbeddingModelId: string;
}): Promise<void> {
  const embeddingText = params.episodeContent.trim().slice(0, 4000);
  if (!embeddingText) return;

  const embedding = await geminiEmbedText({
    apiKey: params.geminiApiKey,
    model: params.geminiEmbeddingModel,
    text: embeddingText,
  });

  const { error } = await params.supabase.from("episode_chunks").insert({
    novel_id: params.novelId,
    episode_id: params.episodeId,
    episode_no: params.episodeNo,
    chunk_kind: "episode",
    chunk_index: 0,
    content: embeddingText,
    embedding: vectorLiteral(embedding),
    embedding_dim: embedding.length,
    embedding_model: params.ragEmbeddingModelId,
  });

  if (error) throw new Error(`indexEpisodeSummary: ${error.message}`);
}

export async function resolvePlotSeeds(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
  episodeId: string;
  plotSeedIds: string[];
}): Promise<void> {
  if (params.plotSeedIds.length === 0) return;

  const { error } = await params.supabase
    .from("plot_seeds")
    .update({
      status: "resolved",
      resolved_in_episode_id: params.episodeId,
    })
    .eq("novel_id", params.novelId)
    .in("id", params.plotSeedIds);

  if (error) throw new Error(`resolvePlotSeeds: ${error.message}`);
}

export type {
  DbSelectArgs,
  InsertPlotSeedArgs,
  RagSearchChunksArgs,
  RagSearchSummariesArgs,
  SupabaseFilter,
  UpsertCharacterArgs,
  UpsertLocationArgs,
};
