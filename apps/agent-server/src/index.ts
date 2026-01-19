import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import type { Json } from "@fantasy-diary/shared/supabase/type";
import {
  type FunctionCall,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  GoogleGenAI,
  type Part,
  Type,
} from "@google/genai";
import { assert } from "es-toolkit";

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
  introduced_in_episode_id?: string;
  character_names?: string[];
  location_names?: string[];
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


type Logger = {
  info: (event: string, data?: Record<string, unknown>) => void;
  debug: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
};

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

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }

    return v;
  });
}

function truncateString(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[MaxDepth]";
  if (value === null) return null;

  const type = typeof value;
  if (type === "string") return truncateString(value as string, 400);
  if (type === "number" || type === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeForLog(v, depth + 1));
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const entries = Object.entries(obj).slice(0, 40);

    for (const [k, v] of entries) {
      const key = k.toLowerCase();
      if (
        key.includes("key") ||
        key.includes("secret") ||
        key.includes("token") ||
        key.includes("authorization")
      ) {
        out[k] = "[REDACTED]";
        continue;
      }

      out[k] = sanitizeForLog(v, depth + 1);
    }

    return out;
  }

  return "[Unserializable]";
}

function createLogger(params: { quiet: boolean; debug: boolean }): Logger {
  function emit(level: "info" | "debug" | "warn" | "error", event: string, data?: Record<string, unknown>) {
    if (params.quiet && level !== "error") return;
    if (level === "debug" && !params.debug) return;

    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(data ? { data: sanitizeForLog(data) } : {}),
    };

    const line = safeJsonStringify(payload);

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }

  return {
    info: (event, data) => emit("info", event, data),
    debug: (event, data) => emit("debug", event, data),
    warn: (event, data) => emit("warn", event, data),
    error: (event, data) => emit("error", event, data),
  };
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

  const introducedInEpisodeId =
    typeof params.args.introduced_in_episode_id === "string"
      ? params.args.introduced_in_episode_id.trim()
      : "";

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
        introduced_in_episode_id: introducedInEpisodeId || null,
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
        throw new Error(
          `insert_plot_seed: link locations: ${linkError.message}`
        );
    }
  }

  return data;
}

function createGeminiSupabaseCallableTool(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  geminiApiKey: string;
  geminiEmbeddingModel: string;
  ragEmbeddingModelId: string;
  logger: Logger;
}) {
  const createdPlotSeedIds: string[] = [];
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
           introduced_in_episode_id: {
             type: Type.STRING,
             description:
               "Optional episode id where this plot seed was introduced (episodes.id).",
           },
           character_names: {
             type: Type.ARRAY,
             description:
               "Optional character names related to this plot seed. Must match existing characters.name.",
             items: { type: Type.STRING },
           },
           location_names: {
             type: Type.ARRAY,
             description:
               "Optional location names related to this plot seed. Must match existing locations.name.",
             items: { type: Type.STRING },
           },
         },
         required: ["novel_id", "title", "detail"],
       },
     },
  ];

  return {
    tool: async () => ({ functionDeclarations: declarations }),
    getCreatedPlotSeedIds: (): string[] => Array.from(new Set(createdPlotSeedIds)),
    callTool: async (calls: FunctionCall[]): Promise<Part[]> => {
      const parts: Part[] = [];

      params.logger.info("gemini.tool_calls", {
        count: calls.length,
        tools: calls.map((c) => ({ name: c.name, args: c.args })),
      });

      for (const call of calls) {
        const name = call.name;
        if (!name) continue;

        if (name === "db_select") {
          const startedAt = Date.now();
          const result = await dbSelect(
            params.supabase,
            call.args as unknown as DbSelectArgs
          );

          const ms = Date.now() - startedAt;

          const count = Array.isArray(result) ? result.length : undefined;
          params.logger.info("tool.db_select", { ms, rows: count });

          parts.push({
            functionResponse: {
              name,
              response: { data: result },
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
              response: { data: result },
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
              response: { data: result },
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
              response: { data: result },
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
              response: { data: result },
            },
          });

          continue;
        }

        if (name === "insert_plot_seed") {
          const result = await insertPlotSeed({
            supabase: params.supabase,
            args: call.args as unknown as InsertPlotSeedArgs,
          });

          createdPlotSeedIds.push(result.id);

          parts.push({
            functionResponse: {
              name,
              response: { data: result },
            },
          });

          continue;
        }

        parts.push({
          functionResponse: {
            name,
            response: { error: `Unknown tool: ${name}` },
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

async function markPlotSeedsIntroduced(params: {
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

function containsEpisodeMeta(text: string): boolean {
  const normalized = text.replaceAll(" ", "");

  const patterns: RegExp[] = [
    /\d+회차/,
    /\d+화/,
    /지난회차/,
    /이전회차/,
    /전회차/,
    /지난화/,
    /이전화/,
    /전편/,
    /이전편/,
  ];

  return patterns.some((p) => p.test(normalized));
}

function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;

  const record = err as { status?: unknown };
  return typeof record.status === "number" ? record.status : undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "";
}

function isRetryableGeminiError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 429 || status === 503) return true;

  const message = getErrorMessage(err).toLowerCase();

  if (message.includes("overloaded") || message.includes("unavailable")) return true;
  if (message.includes("quota") || message.includes("resource_exhausted")) return true;
  if (message.includes("\"code\":429") || message.includes("\"code\":503")) return true;
  if (message.includes("gemini returned empty text")) return true;

  return false;
}

function getGeminiRetryDelayMs(err: unknown): number | undefined {
  const message = getErrorMessage(err);

  const retryInMatch = message.match(/retry in ([0-9.]+)s/i);
  if (retryInMatch) {
    const seconds = Number(retryInMatch[1]);
    return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined;
  }

  const retryDelayMatch = message.match(/"retryDelay":"(\d+)s"/);
  if (retryDelayMatch) {
    const seconds = Number(retryDelayMatch[1]);
    return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined;
  }

  return undefined;
}

async function sendGeminiWithRetry<T>(
  params: {
    send: () => Promise<T>;
    maxAttempts: number;
  }
): Promise<T> {
  const baseDelayMs = 700;

  for (let attempt = 1; attempt <= params.maxAttempts; attempt++) {
    try {
      return await params.send();
    } catch (err) {
      if (!isRetryableGeminiError(err) || attempt === params.maxAttempts) throw err;

      const jitter = Math.floor(Math.random() * 250);
      const retryDelayMs = getGeminiRetryDelayMs(err);
      const delayMs = retryDelayMs ?? baseDelayMs * 2 ** (attempt - 1) + jitter;

      await Bun.sleep(Math.min(65_000, delayMs));
    }
  }

  throw new Error("Unreachable");
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
    "- episodes: 필요한 과거 회차 원문(일관성 유지 목적)",
    "novels.brief가 비어있지 않으면 그 내용이 작품의 성경이다.",
    "brief는 현재 다음 구조를 가진다(예시): cast(protagonist, key_characters[]), locations[], initial_plot_seeds[].",
    "characters/locations/plot_seeds가 비어 있어도 novels.brief의 정보를 우선 사용해 세계관을 세팅해라.",
    "캐릭터/장소/떡밥은 반드시 필요할 때만 생성/업데이트하라(등장/언급/서사적으로 의미가 생길 때). 가능한 한 먼저 novels.brief와 기존 DB 데이터를 재사용하라.",
    "정말로 필요할 때만 아래 write tools를 사용해라(최소 호출): upsert_character, upsert_location, insert_plot_seed.",
    "insert_plot_seed를 호출할 때 관련 캐릭터/장소가 있으면 character_names/location_names를 함께 넘겨 조인 테이블을 연결해라.",
    "novels.brief는 변경하지 마라. brief는 기획서(성경)로 고정이다.",
    "메타 표현 금지: 본문에 '1회차/2회차/1화/2화/지난 회차/이전 회차/전 회차/지난 화/이전 화/전편' 같은 회차 라벨을 절대 쓰지 마라.",
    "과거 사건은 '지난밤/아까/조금 전/그때'처럼 이야기 안에서 자연스럽게 이어서 써라.",
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
        },
      },
      systemInstruction,
    },
  });

  const message = [
    `대상 소설 ID: ${params.novelId}`,
    `이번에 작성할 회차 번호: ${params.episodeNo}`,
    `이전 회차 최대 번호: ${params.maxEpisodeNo}`,
    "Supabase에서 데이터를 조회하고, 앞뒤가 끊기지 않게 자연스럽게 이어서 써라.",
    "회차 번호/회차 라벨(예: 1회차, 2화, 지난 회차) 언급은 금지다.",
  ].join("\n");

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await sendGeminiWithRetry({
      maxAttempts: 5,
      send: async () => {
        const next = await chat.sendMessage({
          message:
            attempt === 1
              ? message
              : "직전 출력이 규칙을 위반했다. 회차 라벨/메타 표현을 완전히 제거하고, 사건/감정/상황으로만 자연스럽게 이어지게 다시 작성해라. JSON만 출력.",
        });

        const text = next.text;
        if (typeof text !== "string" || text.trim().length === 0)
          throw new Error("Gemini returned empty text");

        return next;
      },
    });
    const text = response.text;
    if (typeof text !== "string" || text.trim().length === 0)
      throw new Error("Gemini returned empty text");

    const json = extractFirstJsonObject(text);
    const generated = assertGenerateResult(json);

    if (!containsEpisodeMeta(generated.episode_content)) return generated;

    if (attempt === 2) throw new Error("Generated episode contains episode-label meta references");
  }

  throw new Error("Unreachable");
}

async function main(): Promise<void> {
  const { args } = parseArgs(Bun.argv.slice(2));

  const kind = typeof args.kind === "string" ? args.kind : "daily";
  const novelId = typeof args.novelId === "string" ? args.novelId : undefined;
  const dryRun = toBoolean(args.dryRun, false);
  const quiet = toBoolean(args.quiet, false);
  const debug = toBoolean(args.debug, false);

  const logger = createLogger({ quiet, debug });

  const geminiApiKey = process.env.GEMINI_API_KEY;
  assert(geminiApiKey, "Missing required env: GEMINI_API_KEY");

  logger.info("run.start", { kind, novelId, dryRun });

  const geminiModel = "gemini-3-flash-preview";
  const geminiEmbeddingModel = "text-embedding-004";
  const ragEmbeddingModelId = "gemini/text-embedding-004";

  const supabase = createSupabaseAdminClient();

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });


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
    logger.info("novel.start", { novelId: targetNovelId });

    const episodeNo = await getNextEpisodeNo({ supabase, novelId: targetNovelId });
    const maxEpisodeNo = episodeNo - 1;

    const tool = createGeminiSupabaseCallableTool({
      supabase,
      geminiApiKey,
      geminiEmbeddingModel,
      ragEmbeddingModelId,
      logger,
    });

    logger.info("episode.generate.start", {
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
      model: geminiModel,
    });

    const t0 = Date.now();
    const generated = await generateEpisodeWithTools({
      ai,
      model: geminiModel,
      tool,
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
    });
    logger.info("episode.generate.done", {
      ms: Date.now() - t0,
      episodeNo,
      contentChars: generated.episode_content.length,
      resolvedPlotSeeds: generated.resolved_plot_seed_ids?.length ?? 0,
    });

    const resolvedPlotSeedIds = Array.from(
      new Set(generated.resolved_plot_seed_ids ?? [])
    ).filter((id) => id.trim().length > 0);

    if (dryRun) {
      results.push({ novel_id: targetNovelId, episode_no: episodeNo });
      logger.info("episode.dry_run", { novelId: targetNovelId, episodeNo });
      continue;
    }

    logger.info("episode.persist.start", { novelId: targetNovelId, episodeNo });

    const episode = await insertEpisode({
      supabase,
      novelId: targetNovelId,
      episodeNo,
      episodeContent: generated.episode_content,
    });

    logger.info("episode.persist.inserted", {
      novelId: targetNovelId,
      episodeNo,
      episodeId: episode.id,
    });

    await markPlotSeedsIntroduced({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      plotSeedIds: tool.getCreatedPlotSeedIds(),
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

    logger.info("episode.persist.indexed", {
      novelId: targetNovelId,
      episodeNo,
      episodeId: episode.id,
    });

    await resolvePlotSeeds({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      plotSeedIds: resolvedPlotSeedIds,
    });

    if (resolvedPlotSeedIds.length > 0) {
      logger.info("plot_seeds.resolved", {
        novelId: targetNovelId,
        episodeId: episode.id,
        count: resolvedPlotSeedIds.length,
      });
    }

    results.push({
      novel_id: targetNovelId,
      episode_no: episode.episode_no,
      episode_id: episode.id,
    });

    logger.info("novel.done", { novelId: targetNovelId, episodeNo });
  }

  logger.info("run.done", { count: results.length });
  console.info(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
