import type { GoogleGenAI } from "@google/genai";
import { FunctionCallingConfigMode } from "@google/genai";
import { z } from "zod";

import { AgentError } from "../errors/agentError";
import type { GeminiSupabaseTool } from "../tools";
import repairPromptTemplate from "./prompts/repair.md";
import retryPrompt from "./prompts/retry.md";
import systemPrompt from "./prompts/system.md";
import userPromptTemplate from "./prompts/user.md";

type GenerateResult = {
  episode_content: string;
  story_time: string;
  resolved_plot_seed_ids?: string[];
};

const GenerateResultSchema = z
  .object({
    episode_content: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, {
        message: "episode_content is required",
      }),
    story_time: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, {
        message: "story_time is required",
      })
      .refine((value) => Number.isFinite(Date.parse(value)), {
        message: "story_time must be an ISO timestamp",
      })
      .transform((value) => new Date(Date.parse(value)).toISOString()),
    resolved_plot_seed_ids: z
      .array(
        z
          .string()
          .transform((value) => value.trim())
          .refine((value) => value.length > 0, { message: "plot seed id must be non-empty" })
      )
      .optional(),
  })
  .strict();

function parseGenerateResult(value: unknown): GenerateResult {
  const parsed = GenerateResultSchema.parse(value);

  const resolvedPlotSeedIds = parsed.resolved_plot_seed_ids
    ? Array.from(new Set(parsed.resolved_plot_seed_ids))
    : undefined;

  return {
    episode_content: parsed.episode_content,
    story_time: parsed.story_time,
    resolved_plot_seed_ids:
      resolvedPlotSeedIds && resolvedPlotSeedIds.length > 0 ? resolvedPlotSeedIds : undefined,
  };
}

function extractFirstJsonObject(text: string): unknown {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first)
    throw new AgentError({
      type: "PARSE_ERROR",
      code: "INVALID_JSON",
      message: "Model did not return JSON",
      details: { op: "extract_json" },
    });
  const candidate = text.slice(first, last + 1).trim();

  return JSON.parse(candidate);
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in variables ? variables[key] : "";
  });
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function geminiEmbedText(params: {
  apiKey: string;
  model: string;
  text: string;
}): Promise<number[]> {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      params.model
    )}:embedContent`
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

    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: res.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE",
      message: `Gemini embed API error: ${res.status} ${message ?? res.statusText}`,
      retryable: res.status === 429 || res.status >= 500,
      details: { status: res.status },
    });
  }

  const values = json?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0)
    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "GEMINI_EMBED_FAILED",
      message: "Gemini embed API returned empty embedding",
      retryable: true,
      details: { reason: "empty_embedding" },
    });

  const numbers: number[] = [];
  for (const v of values) {
    if (typeof v !== "number")
      throw new AgentError({
        type: "UPSTREAM_API_ERROR",
        code: "GEMINI_EMBED_FAILED",
        message: "Gemini embed API returned non-numeric embedding",
        retryable: true,
        details: { reason: "non_numeric_embedding" },
      });
    numbers.push(v);
  }

  return numbers;
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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  return typeof err === "string" ? err : "";
}

function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;

  const record = err as { status?: unknown };

  return typeof record.status === "number" ? record.status : undefined;
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

async function sendGeminiWithRetry<T>(params: {
  send: () => Promise<T>;
  maxAttempts: number;
}): Promise<T> {
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

  throw new AgentError({
    type: "UNEXPECTED_ERROR",
    code: "UNKNOWN",
    message: "Unreachable",
  });
}

export async function generateEpisodeWithTools(params: {
  ai: GoogleGenAI;
  model: string;
  tool: GeminiSupabaseTool;
  novelId: string;
  episodeNo: number;
  maxEpisodeNo: number;
}): Promise<GenerateResult> {
  const systemInstruction = systemPrompt.trim();

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

  const message = renderTemplate(userPromptTemplate, {
    novelId: params.novelId,
    episodeNo: String(params.episodeNo),
    maxEpisodeNo: String(params.maxEpisodeNo),
  }).trim();
  const retryMessage = retryPrompt.trim();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await sendGeminiWithRetry({
      maxAttempts: 5,
      send: async () => {
        const next = await chat.sendMessage({
          message: attempt === 1 ? message : retryMessage,
        });

        const text = next.text;
        if (typeof text !== "string" || text.trim().length === 0)
          throw new AgentError({
            type: "UPSTREAM_API_ERROR",
            code: "UNAVAILABLE",
            message: "Gemini returned empty text",
            retryable: true,
            details: { op: "chat.sendMessage" },
          });

        return next;
      },
    });
    const text = response.text;
    if (typeof text !== "string" || text.trim().length === 0)
      throw new AgentError({
        type: "UPSTREAM_API_ERROR",
        code: "UNAVAILABLE",
        message: "Gemini returned empty text",
        retryable: true,
        details: { op: "chat.sendMessage" },
      });

    let generated: GenerateResult;

    try {
      const json = extractFirstJsonObject(text);
      generated = parseGenerateResult(json);
    } catch (err) {
      const zodIssues =
        err instanceof z.ZodError
          ? err.issues
              .map((issue) => {
                const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";

                return `- ${path}: ${issue.message}`;
              })
              .join("\n")
          : undefined;

      const repairPrompt = renderTemplate(repairPromptTemplate, {
        issues: zodIssues ? `Zod 에러:\n${zodIssues}` : `에러: ${String(err)}`,
      }).trim();

      const repaired = await sendGeminiWithRetry({
        maxAttempts: 3,
        send: async () => {
          const next = await chat.sendMessage({ message: repairPrompt });

          const repairedText = next.text;
          if (typeof repairedText !== "string" || repairedText.trim().length === 0)
            throw new AgentError({
              type: "UPSTREAM_API_ERROR",
              code: "UNAVAILABLE",
              message: "Gemini returned empty text",
              retryable: true,
              details: { op: "chat.sendMessage" },
            });

          return next;
        },
      });

      const repairedText = repaired.text;
      if (typeof repairedText !== "string" || repairedText.trim().length === 0)
        throw new AgentError({
          type: "UPSTREAM_API_ERROR",
          code: "UNAVAILABLE",
          message: "Gemini returned empty text",
          retryable: true,
          details: { op: "chat.sendMessage" },
        });

      const repairedJson = extractFirstJsonObject(repairedText);
      generated = parseGenerateResult(repairedJson);
    }

    if (!containsEpisodeMeta(generated.episode_content)) return generated;

    if (attempt === 2)
      throw new AgentError({
        type: "VALIDATION_ERROR",
        code: "INVALID_ARGUMENT",
        message: "Generated episode contains episode-label meta references",
        hint: "Rewrite to avoid referencing previous episode numbers or '지난 화'.",
        details: { rule: "no_episode_meta" },
      });
  }

  throw new AgentError({
    type: "UNEXPECTED_ERROR",
    code: "UNKNOWN",
    message: "Unreachable",
  });
}

export type { GenerateResult };
