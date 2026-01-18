import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type FunctionCall,
  type FunctionDeclaration,
  type Part,
} from "@google/genai";

import type { Json } from "@fantasy-diary/shared/supabase";
import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase-client";

type ArgMap = Record<string, string | boolean>;

type SupabaseFilter =
  | { column: string; op: "eq" | "gte" | "lte" | "like" | "ilike"; value: string }
  | { column: string; op: "in"; value: string[] };

type DbSelectArgs = {
  table:
    | "novels"
    | "episodes"
    | "characters"
    | "locations"
    | "plot_seeds"
    | "plot_seed_characters"
    | "plot_seed_locations"
    | "episode_chunks";
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

type UpsertCharacterArgs = {
  novel_id: string;
  name: string;
  profile: unknown;
};

type UpsertLocationArgs = {
  novel_id: string;
  name: string;
  profile: unknown;
};

type InsertPlotSeedArgs = {
  novel_id: string;
  title: string;
  detail: string;
};

type GenerateResult = {
  episode_content: string;
  resolved_plot_seed_ids?: string[];
};

function parseArgs(argv: string[]): { args: ArgMap; positionals: string[] } {
  const args: ArgMap = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);

    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      args[key] = rest.join("=");
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      i++;
      continue;
    }

    args[withoutPrefix] = true;
  }

  return { args, positionals };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);

  return value;
}

function toBoolean(
  value: string | boolean | undefined,
  defaultValue: boolean
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  return defaultValue;
}

function extractFirstJsonObject(text: string): unknown {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first)
    throw new Error("Model did not return JSON");
  const candidate = text.slice(first, last + 1).trim();

  return JSON.parse(candidate);
}

function assertGenerateResult(value: unknown): GenerateResult {
  if (!value || typeof value !== "object")
    throw new Error("Invalid model result (not an object)");

  const record = value as Record<string, unknown>;
  const episodeContent =
    typeof record.episode_content === "string" ? record.episode_content.trim() : "";

  if (!episodeContent)
    throw new Error("Invalid model result: episode_content is required");

  let resolvedPlotSeedIds: string[] | undefined;
  if (record.resolved_plot_seed_ids !== undefined) {
    if (!Array.isArray(record.resolved_plot_seed_ids)) {
      throw new Error(
        "Invalid model result: resolved_plot_seed_ids must be an array"
      );
    }

    resolvedPlotSeedIds = [];
    for (const id of record.resolved_plot_seed_ids) {
      if (typeof id !== "string")
        throw new Error(
          "Invalid model result: resolved_plot_seed_ids must be string[]"
        );
      const trimmed = id.trim();
      if (trimmed) resolvedPlotSeedIds.push(trimmed);
    }

    if (resolvedPlotSeedIds.length === 0) resolvedPlotSeedIds = undefined;
  }

  return { episode_content: episodeContent, resolved_plot_seed_ids: resolvedPlotSeedIds };
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function geminiEmbedText(params: {
  apiKey: string;
  model: string;
  text: string;
}): Promise<number[]> {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:embedContent`
  );
  url.searchParams.set("key", params.apiKey);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: {
        parts: [{ text: params.text }],
      },
    }),
  });

  const json = (await res.json().catch(() => null)) as
    | { embedding?: { values?: unknown } }
    | null;

  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error
      ?.message;
    throw new Error(
      `Gemini embed API error: ${res.status} ${message ?? res.statusText}`
    );
  }

  const values = json?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0)
    throw new Error("Gemini embed API returned empty embedding");

  const numbers: number[] = [];
  for (const v of values) {
    if (typeof v !== "number")
      throw new Error("Gemini embed API returned non-numeric embedding");
    numbers.push(v);
  }

  return numbers;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJson(value: unknown, depth = 0): Json {
  if (depth > 20) throw new Error("JSON value too deep");
  if (value === null) return null;

  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("JSON number must be finite");
    return value;
  }
  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    const list: Json[] = [];
    for (const item of value) list.push(toJson(item, depth + 1));
    return list;
  }

  if (isPlainObject(value)) {
    const obj: Record<string, Json> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (raw === undefined) continue;
      obj[key] = toJson(raw, depth + 1);
    }
    return obj;
  }

  throw new Error("Value is not JSON-serializable");
}

function toJsonObject(value: unknown): Record<string, Json> {
  const json = toJson(value);
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new Error("Expected JSON object");

  return json as Record<string, Json>;
}

function isEpisodeChunksEmbeddingSelected(select?: string): boolean {
  const selection = (select ?? "*").replaceAll(" ", "");
  if (selection === "*") return true;

  return selection.split(",").some((part) => part === "embedding");
}

async function dbSelect(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  params: DbSelectArgs
): Promise<unknown> {
  const allowedTables: Array<DbSelectArgs["table"]> = [
    "novels",
    "episodes",
    "characters",
    "locations",
    "plot_seeds",
    "plot_seed_characters",
    "plot_seed_locations",
    "episode_chunks",
  ];

  if (!allowedTables.includes(params.table)) {
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

async function ragSearchSummaries(params: {
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

async function ragSearchChunks(params: {
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

async function upsertCharacter(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  args: UpsertCharacterArgs;
}): Promise<{ id: string; name: string }> {
  const novelId = params.args.novel_id;
  const name = params.args.name.trim();

  if (!novelId) throw new Error("upsert_character: novel_id is required");
  if (!name) throw new Error("upsert_character: name is required");
  const nextProfile = toJsonObject(params.args.profile);

  const { data: existing, error: existingError } = await params.supabase
    .from("characters")
    .select("id,profile,name")
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
        profile: nextProfile,
      })
      .select("id,name")
      .single();

    if (error) throw new Error(`upsert_character: ${error.message}`);
    if (!data) throw new Error("upsert_character: insert failed");
    return data;
  }

  const currentProfile =
    current.profile &&
    typeof current.profile === "object" &&
    !Array.isArray(current.profile)
      ? (current.profile as Record<string, Json>)
      : {};

  const mergedProfile: Record<string, Json> = {
    ...currentProfile,
    ...nextProfile,
  };

  const { data, error } = await params.supabase
    .from("characters")
    .update({ profile: mergedProfile })
    .eq("id", current.id)
    .select("id,name")
    .single();

  if (error) throw new Error(`upsert_character: ${error.message}`);
  if (!data) throw new Error("upsert_character: update failed");
  return data;
}

async function upsertLocation(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  args: UpsertLocationArgs;
}): Promise<{ id: string; name: string }> {
  const novelId = params.args.novel_id;
  const name = params.args.name.trim();

  if (!novelId) throw new Error("upsert_location: novel_id is required");
  if (!name) throw new Error("upsert_location: name is required");
  const nextProfile = toJsonObject(params.args.profile);

  const { data: existing, error: existingError } = await params.supabase
    .from("locations")
    .select("id,profile,name")
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
        profile: nextProfile,
      })
      .select("id,name")
      .single();

    if (error) throw new Error(`upsert_location: ${error.message}`);
    if (!data) throw new Error("upsert_location: insert failed");
    return data;
  }

  const currentProfile =
    current.profile &&
    typeof current.profile === "object" &&
    !Array.isArray(current.profile)
      ? (current.profile as Record<string, Json>)
      : {};

  const mergedProfile: Record<string, Json> = {
    ...currentProfile,
    ...nextProfile,
  };

  const { data, error } = await params.supabase
    .from("locations")
    .update({ profile: mergedProfile })
    .eq("id", current.id)
    .select("id,name")
    .single();

  if (error) throw new Error(`upsert_location: ${error.message}`);
  if (!data) throw new Error("upsert_location: update failed");
  return data;
}

async function insertPlotSeed(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  args: InsertPlotSeedArgs;
}): Promise<{ id: string; title: string; status: string }> {
  const novelId = params.args.novel_id;
  const title = params.args.title.trim();
  const detail = params.args.detail.trim();

  if (!novelId) throw new Error("insert_plot_seed: novel_id is required");
  if (!title) throw new Error("insert_plot_seed: title is required");
  if (!detail) throw new Error("insert_plot_seed: detail is required");

  const { data, error } = await params.supabase
    .from("plot_seeds")
    .insert({
      novel_id: novelId,
      title,
      detail,
      status: "open",
    })
    .select("id,title,status")
    .single();

  if (error) throw new Error(`insert_plot_seed: ${error.message}`);
  if (!data) throw new Error("insert_plot_seed: insert failed");
  return data;
}

function createGeminiSupabaseCallableTool(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  geminiApiKey: string;
  geminiEmbeddingModel: string;
  ragEmbeddingModelId: string;
}) {
  const declarations: FunctionDeclaration[] = [
    {
      name: "db_select",
      description:
        "Read-only select from Supabase. Use this to load novel state (novels/characters/locations/plot_seeds/episodes).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          table: {
            type: Type.STRING,
            description:
              "One of: novels, episodes, characters, locations, plot_seeds, plot_seed_characters, plot_seed_locations, episode_chunks",
          },
          select: {
            type: Type.STRING,
            description: "Select string. Default is *.",
          },
          filters: {
            type: Type.ARRAY,
            description: "Column filters.",
            items: {
              type: Type.OBJECT,
              properties: {
                column: { type: Type.STRING },
                op: { type: Type.STRING, description: "eq|gte|lte|like|ilike|in" },
                value: {
                  description: "string for most ops; string[] for in",
                },
              },
              required: ["column", "op", "value"],
            },
          },
          order: {
            type: Type.OBJECT,
            properties: {
              column: { type: Type.STRING },
              ascending: { type: Type.BOOLEAN },
            },
          },
          limit: {
            type: Type.NUMBER,
            description:
              "Max rows. Hard-capped (episodes+content max 10, otherwise max 50).",
          },
        },
        required: ["table"],
      },
    },
    {
      name: "rag_search_summaries",
      description:
        "Vector search over episode summaries (episode_chunks where chunk_kind=episode). Returns candidate episodes for grounding.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          query: {
            type: Type.STRING,
            description: "Text query for embedding and search.",
          },
          max_episode_no: { type: Type.NUMBER },
          match_count: { type: Type.NUMBER },
        },
        required: ["novel_id", "query", "max_episode_no"],
      },
    },
    {
      name: "rag_search_chunks",
      description:
        "Vector search over episode_chunks for a specific chunk_kind (episode|fact|style).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          query: { type: Type.STRING },
          chunk_kind: {
            type: Type.STRING,
            description: "episode|fact|style",
          },
          max_episode_no: { type: Type.NUMBER },
          match_count: { type: Type.NUMBER },
        },
        required: ["novel_id", "query", "chunk_kind", "max_episode_no"],
      },
    },
    {
      name: "upsert_character",
      description:
        "Create or update a character for this novel. Matches by (novel_id, name). Merges profile fields.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          name: { type: Type.STRING },
          profile: {
            type: Type.OBJECT,
            description:
              "JSON object with character attributes (e.g. role, goal, weakness, secrets, relationships).",
          },
        },
        required: ["novel_id", "name", "profile"],
      },
    },
    {
      name: "upsert_location",
      description:
        "Create or update a location for this novel. Matches by (novel_id, name). Merges profile fields.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          name: { type: Type.STRING },
          profile: {
            type: Type.OBJECT,
            description:
              "JSON object with location attributes (e.g. vibe, hazards, resources, landmarks, rules).",
          },
        },
        required: ["novel_id", "name", "profile"],
      },
    },
    {
      name: "insert_plot_seed",
      description:
        "Create a new open plot seed (떡밥). Use when introducing unresolved hooks that should persist.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ["novel_id", "title", "detail"],
      },
    },
  ];

  return {
    tool: async () => ({ functionDeclarations: declarations }),
    callTool: async (calls: FunctionCall[]): Promise<Part[]> => {
      const parts: Part[] = [];

      for (const call of calls) {
        const name = call.name;
        if (!name) continue;

        if (name === "db_select") {
          const result = await dbSelect(
            params.supabase,
            call.args as unknown as DbSelectArgs
          );

          parts.push({
            functionResponse: {
              name,
              response: result as Record<string, unknown>,
            },
          });

          continue;
        }

        if (name === "rag_search_summaries") {
          const result = await ragSearchSummaries({
            supabase: params.supabase,
            geminiApiKey: params.geminiApiKey,
            geminiEmbeddingModel: params.geminiEmbeddingModel,
            ragEmbeddingModelId: params.ragEmbeddingModelId,
            args: call.args as unknown as RagSearchSummariesArgs,
          });

          parts.push({
            functionResponse: {
              name,
              response: result as Record<string, unknown>,
            },
          });

          continue;
        }

        if (name === "rag_search_chunks") {
          const result = await ragSearchChunks({
            supabase: params.supabase,
            geminiApiKey: params.geminiApiKey,
            geminiEmbeddingModel: params.geminiEmbeddingModel,
            ragEmbeddingModelId: params.ragEmbeddingModelId,
            args: call.args as unknown as RagSearchChunksArgs,
          });

          parts.push({
            functionResponse: {
              name,
              response: result as Record<string, unknown>,
            },
          });

          continue;
        }

        if (name === "upsert_character") {
          const result = await upsertCharacter({
            supabase: params.supabase,
            args: call.args as unknown as UpsertCharacterArgs,
          });

          parts.push({
            functionResponse: {
              name,
              response: result as unknown as Record<string, unknown>,
            },
          });

          continue;
        }

        if (name === "upsert_location") {
          const result = await upsertLocation({
            supabase: params.supabase,
            args: call.args as unknown as UpsertLocationArgs,
          });

          parts.push({
            functionResponse: {
              name,
              response: result as unknown as Record<string, unknown>,
            },
          });

          continue;
        }

        if (name === "insert_plot_seed") {
          const result = await insertPlotSeed({
            supabase: params.supabase,
            args: call.args as unknown as InsertPlotSeedArgs,
          });

          parts.push({
            functionResponse: {
              name,
              response: result as unknown as Record<string, unknown>,
            },
          });

          continue;
        }

        parts.push({
          functionResponse: {
            name,
            response: {
              error: `Unknown tool: ${name}`,
            },
          },
        });
      }

      return parts;
    },
  };
}

async function getNextEpisodeNo(params: {
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

async function insertEpisode(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
  episodeNo: number;
  episodeContent: string;
}): Promise<{ id: string; episode_no: number }> {
  const { data, error } = await params.supabase
    .from("episodes")
    .insert({
      novel_id: params.novelId,
      episode_no: params.episodeNo,
      content: params.episodeContent,
    })
    .select("id,episode_no")
    .single();

  if (error) throw new Error(`insertEpisode: ${error.message}`);
  if (!data) throw new Error("insertEpisode: insert failed");
  return data;
}

async function indexEpisodeSummary(params: {
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

async function resolvePlotSeeds(params: {
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

async function generateEpisodeWithTools(params: {
  ai: GoogleGenAI;
  model: string;
  tool: ReturnType<typeof createGeminiSupabaseCallableTool>;
  novelId: string;
  episodeNo: number;
  maxEpisodeNo: number;
}): Promise<GenerateResult> {
  const systemInstruction = [
    "너는 연재 소설 작가 AI다.",
    "너의 목표는 다음 회차(약 1분 분량)를 한국어로 작성하는 것이다.",
    "필요한 정보는 반드시 tools를 통해 Supabase에서 읽어라. 추측 금지.",
    "최소한 다음은 tool로 확인해라:",
    "- novels: title/genre/brief(기획서)",
    "- characters, locations: 있으면 설정으로 사용",
    "- plot_seeds(status=open): 있으면 떡밥으로 사용",
    "- episodes: 필요한 과거 회차 원문(근거 단락 인용 목적)",
    "novels.brief가 비어있지 않으면 그 내용이 작품의 성경이다.",
    "characters/locations/plot_seeds가 비어 있어도 novels.brief의 정보를 우선 사용해 세계관을 세팅해라.",
    "캐릭터/장소/떡밥은 반드시 필요할 때만 생성/업데이트하라(등장/언급/서사적으로 의미가 생길 때). 가능한 한 먼저 novels.brief와 기존 DB 데이터를 재사용하라.",
    "정말로 필요할 때만 아래 write tools를 사용해라(최소 호출): upsert_character, upsert_location, insert_plot_seed.",
    "novels.brief는 변경하지 마라. brief는 기획서(성경)로 고정이다.",
    "과거 회차가 있으면 rag_search_summaries로 후보 회차를 좁힌 뒤 episodes를 조회해서 근거 단락을 찾아라.",
    "출력은 반드시 JSON만 허용한다(마크다운/코드펜스 금지).",
    "반드시 아래 스키마를 지켜라:",
    '{\n  "episode_content": string,\n  "resolved_plot_seed_ids"?: string[]\n}',
  ].join("\n");

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      tools: [params.tool],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
          allowedFunctionNames: [
            "db_select",
            "rag_search_summaries",
            "rag_search_chunks",
            "upsert_character",
            "upsert_location",
            "insert_plot_seed",
          ],
        },
      },
      systemInstruction,
    },
  });

  const message = [
    `대상 소설 ID: ${params.novelId}`,
    `이번에 작성할 회차 번호: ${params.episodeNo}`,
    `이전 회차 최대 번호: ${params.maxEpisodeNo}`,
    "Supabase에서 데이터를 조회하고, 근거 단락을 포함해 일관성 있게 작성하라.",
  ].join("\n");

  const response = await chat.sendMessage({ message });
  const text = response.text;

  if (typeof text !== "string" || text.trim().length === 0)
    throw new Error("Gemini returned empty text");

  const json = extractFirstJsonObject(text);
  return assertGenerateResult(json);
}

async function main(): Promise<void> {
  const { args } = parseArgs(Bun.argv.slice(2));

  const kind = typeof args.kind === "string" ? args.kind : "daily";
  const novelId = typeof args.novelId === "string" ? args.novelId : undefined;
  const dryRun = toBoolean(args.dryRun, false);

  const geminiApiKey = requireEnv("GEMINI_API_KEY");

  const geminiModel =
    typeof process.env.GEMINI_MODEL === "string" && process.env.GEMINI_MODEL.length > 0
      ? process.env.GEMINI_MODEL
      : "gemini-2.0-flash";

  const geminiEmbeddingModel =
    typeof process.env.GEMINI_EMBEDDING_MODEL === "string" &&
    process.env.GEMINI_EMBEDDING_MODEL.length > 0
      ? process.env.GEMINI_EMBEDDING_MODEL
      : "text-embedding-004";

  const ragEmbeddingModelId =
    typeof process.env.RAG_EMBEDDING_MODEL_ID === "string" &&
    process.env.RAG_EMBEDDING_MODEL_ID.length > 0
      ? process.env.RAG_EMBEDDING_MODEL_ID
      : `gemini/${geminiEmbeddingModel}`;

  const supabase = createSupabaseAdminClient();

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const tool = createGeminiSupabaseCallableTool({
    supabase,
    geminiApiKey,
    geminiEmbeddingModel,
    ragEmbeddingModelId,
  });

  const targetNovelIds: string[] = [];

  if (novelId) {
    targetNovelIds.push(novelId);
  } else if (kind === "daily") {
    const { data, error } = await supabase
      .from("novels")
      .select("id")
      .eq("status", "active")
      .limit(50);

    if (error) throw new Error(`load novels: ${error.message}`);

    for (const n of data ?? []) targetNovelIds.push(n.id);
  } else {
    throw new Error(`Unknown --kind: ${kind}`);
  }

  const results: Array<{ novel_id: string; episode_no: number; episode_id?: string }> = [];

  for (const targetNovelId of targetNovelIds) {
    const episodeNo = await getNextEpisodeNo({ supabase, novelId: targetNovelId });
    const maxEpisodeNo = episodeNo - 1;

    const generated = await generateEpisodeWithTools({
      ai,
      model: geminiModel,
      tool,
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
    });

    const resolvedPlotSeedIds = Array.from(
      new Set(generated.resolved_plot_seed_ids ?? [])
    ).filter((id) => id.trim().length > 0);

    if (dryRun) {
      results.push({ novel_id: targetNovelId, episode_no: episodeNo });
      continue;
    }

    const episode = await insertEpisode({
      supabase,
      novelId: targetNovelId,
      episodeNo,
      episodeContent: generated.episode_content,
    });

    await indexEpisodeSummary({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      episodeNo,
      episodeContent: generated.episode_content,
      geminiApiKey,
      geminiEmbeddingModel,
      ragEmbeddingModelId,
    });

    await resolvePlotSeeds({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      plotSeedIds: resolvedPlotSeedIds,
    });

    results.push({
      novel_id: targetNovelId,
      episode_no: episode.episode_no,
      episode_id: episode.id,
    });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
