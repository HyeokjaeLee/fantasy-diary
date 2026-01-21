import type { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import { SupabaseZod } from "@fantasy-diary/shared/supabase/zod";
import type { FunctionCall, FunctionDeclaration, Part } from "@google/genai";
import { Type } from "@google/genai";

import type {
  DbSelectArgs,
  InsertPlotSeedArgs,
  RagSearchChunksArgs,
  RagSearchSummariesArgs,
  UpsertCharacterArgs,
  UpsertLocationArgs,
} from "../db/index";
import {
  dbSelect,
  insertPlotSeed,
  ragSearchChunks,
  ragSearchSummaries,
  upsertCharacter,
  upsertLocation,
} from "../db/index";
import type { Logger } from "../lib/logger";

type GeminiSupabaseTool = {
  tool: () => Promise<{ functionDeclarations: FunctionDeclaration[] }>;
  getCreatedPlotSeedIds: () => string[];
  callTool: (calls: FunctionCall[]) => Promise<Part[]>;
};

export function createGeminiSupabaseCallableTool(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  geminiApiKey: string;
  geminiEmbeddingModel: string;
  ragEmbeddingModelId: string;
  logger: Logger;
}): GeminiSupabaseTool {
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
        "Create or update a character for this novel. Matches by (novel_id, name).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          name: { type: Type.STRING },
          personality: {
            type: Type.STRING,
            description: "Character personality/traits summary.",
          },
          gender: {
            type: Type.STRING,
            description: "male|female",
            enum: Array.from(SupabaseZod.public.Enums.gender.options),
          },
          birthday: {
            type: Type.STRING,
            description: "YYYY-MM-DD",
          },
        },
        required: ["novel_id", "name", "personality", "gender", "birthday"],
      },
    },
    {
      name: "upsert_location",
      description:
        "Create or update a location for this novel. Matches by (novel_id, name).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          novel_id: { type: Type.STRING },
          name: { type: Type.STRING },
          situation: {
            type: Type.STRING,
            description:
              "Current situation/state of this place (e.g. political climate, dangers, events in progress).",
          },
        },
        required: ["novel_id", "name", "situation"],
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

export type { GeminiSupabaseTool };
