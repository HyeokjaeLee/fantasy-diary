import type { GoogleGenAI } from "@google/genai";
import { FunctionCallingConfigMode, Type } from "@google/genai";
import { z } from "zod";

import { AgentError } from "../errors/agentError";
import type { GeminiSupabaseTool } from "../tools";
import repairPromptTemplate from "./prompts/repair.md";
import retryPrompt from "./prompts/retry.md";
import systemPrompt from "./prompts/system.md";
import systemPromptCompact from "./prompts/system_compact.md";
import extractFactsPrompt from "./prompts/extract_facts.md";
import extractEntitiesPrompt from "./prompts/extract_entities.md";
import extractStoryTimePrompt from "./prompts/extract_story_time.md";
import userPromptTemplate from "./prompts/user.md";

type GenerateResult = {
  episode_content: string;
  resolved_plot_seed_ids?: string[];
};

type EpisodeDraft = GenerateResult & {
  story_time: string;
};

type ExtractFactsResult = {
  facts: string[];
};

type ExtractEntitiesResult = {
  characters: Array<{
    id?: string;
    name: string | null;
    name_revealed: boolean;
    descriptor?: string | null;
    first_appearance_excerpt?: string | null;
    name_evidence_excerpt?: string | null;
    personality: string;
    gender?: "male" | "female" | null;
    birthday?: string | null;
  }>;
  locations: Array<{
    name: string;
    situation: string;
  }>;
  plot_seeds: Array<{
    title: string;
    detail: string;
    character_ids?: string[];
    character_names?: string[];
    location_names?: string[];
  }>;
};

function normalizeGender(value: string): "male" | "female" | null | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  if (v === "male" || v === "m" || v === "남" || v === "남성" || v === "남자") return "male";
  if (v === "female" || v === "f" || v === "여" || v === "여성" || v === "여자") return "female";
  return undefined;
}

const GenerateResultSchema = z
  .object({
    episode_content: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, {
        message: "episode_content is required",
      }),
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

const ExtractFactsResultSchema = z
  .object({
    facts: z
      .array(
        z
          .string()
          .transform((v) => v.trim())
          .refine((v) => v.length > 0, { message: "fact must be non-empty" })
      )
      .default([]),
  })
  .strict();

const ExtractEntitiesResultSchema = z
  .object({
    characters: z
      .array(
        z
          .object({
            id: z
              .string()
              .transform((v) => v.trim())
              .refine(
                (v) =>
                  v.length === 0 ||
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    v,
                  ),
                { message: "id must be a uuid" },
              )
              .transform((v) => (v.length === 0 ? undefined : v))
              .optional(),
            name: z
              .string()
              .transform((v) => v.trim())
              .transform((v) => (v.length === 0 ? null : v))
              .nullable(),
            name_revealed: z.boolean().optional(),
            descriptor: z
              .string()
              .transform((v) => v.trim())
              .transform((v) => (v.length === 0 ? null : v))
              .nullable()
              .optional(),
            first_appearance_excerpt: z
              .string()
              .transform((v) => v.trim())
              .transform((v) => (v.length === 0 ? null : v))
              .nullable()
              .optional(),
            name_evidence_excerpt: z
              .string()
              .transform((v) => v.trim())
              .transform((v) => (v.length === 0 ? null : v))
              .nullable()
              .optional(),
            personality: z.string().transform((v) => v.trim()),
            gender: z
              .string()
              .transform((v) => normalizeGender(v))
              .optional(),
            birthday: z
              .preprocess(
                (v) =>
                  typeof v === "string"
                    ? (() => {
                        const s = v.trim();
                        if (!s) return null;
                        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
                      })()
                    : v,
                z.string().nullable()
              )
              .optional(),
          })
          .strict()
          .refine((v) => v.personality.length > 0, { message: "character personality required" })
      )
      .default([]),
    locations: z
      .array(
        z
          .object({
            name: z.string().transform((v) => v.trim()),
            situation: z.string().transform((v) => v.trim()),
          })
          .strict()
          .refine((v) => v.name.length > 0, { message: "location name required" })
          .refine((v) => v.situation.length > 0, { message: "location situation required" })
      )
      .default([]),
    plot_seeds: z
      .array(
        z
          .object({
            title: z.string().transform((v) => v.trim()),
            detail: z.string().transform((v) => v.trim()),
            character_ids: z
              // NOTE: 모델이 종종 uuid가 아닌 값(예: '나')을 반환한다.
              // 여기서는 파서를 깨지 않도록 string으로 받고, parse 단계에서 uuid만 필터링한다.
              .array(z.string().transform((v) => v.trim()).refine(Boolean))
              .optional(),
            character_names: z
              .array(z.string().transform((v) => v.trim()).refine(Boolean))
              .optional(),
            location_names: z
              .array(z.string().transform((v) => v.trim()).refine(Boolean))
              .optional(),
          })
          .strict()
          .refine((v) => v.title.length > 0, { message: "plot seed title required" })
          .refine((v) => v.detail.length > 0, { message: "plot seed detail required" })
      )
      .default([]),
  })
  .strict();

function parseGenerateResult(value: unknown): GenerateResult {
  const parsed = GenerateResultSchema.parse(value);

  const isUuid = (v: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const resolvedPlotSeedIds = parsed.resolved_plot_seed_ids
    ? Array.from(new Set(parsed.resolved_plot_seed_ids)).filter(isUuid)
    : undefined;

  return {
    episode_content: parsed.episode_content,
    resolved_plot_seed_ids:
      resolvedPlotSeedIds && resolvedPlotSeedIds.length > 0 ? resolvedPlotSeedIds : undefined,
  };
}

function normalizeStoryTimeIso(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms))
    throw new AgentError({
      type: "VALIDATION_ERROR",
      code: "INVALID_ARGUMENT",
      message: "story_time must be an ISO timestamp",
      details: { field: "story_time", value },
    });

  // story_time is stored as timestamptz but we prefer KST (+09:00) formatting.
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace("Z", "+09:00");
}

function parseExtractFactsResult(value: unknown): ExtractFactsResult {
  const parsed = ExtractFactsResultSchema.parse(value);
  const deduped = Array.from(new Set(parsed.facts.map((f) => f.trim()).filter(Boolean)));

  return {
    facts: deduped.slice(0, 10),
  };
}

function parseExtractEntitiesResult(value: unknown): ExtractEntitiesResult {
  const parsed = ExtractEntitiesResultSchema.parse(value);

  const isUuid = (v: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const bannedCharacterNames = new Set(
    [
      "나",
      "저",
      "우리",
      "너",
      "너희",
      "당신",
      "그",
      "그녀",
      "그들",
      "이사람",
      "저사람",
      "주인공",
      "남자",
      "여자",
      "사내",
      "소년",
      "소녀",
      "아이",
      "사람",
      "괴한",
      "무리",
      "운전자",
      "직원",
      "경찰",
      "형사",
      "의사",
      "간호사",
      "병사",
      "군인",
    ].map((v) => v.replaceAll(" ", ""))
  );

  const normalizeCharacterName = (nameRaw: string | null): string | null => {
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    if (!name) return null;
    const compact = name.replaceAll(" ", "");
    if (compact.length < 2) return null;
    if (bannedCharacterNames.has(compact)) return null;
    // Avoid placeholders like "남자1", "여자2"
    if (/^(남자|여자|사람|괴한)\d+$/.test(compact)) return null;
    return name;
  };

  const dedupeBy = <T>(items: T[], key: (t: T) => string): T[] => {
    const map = new Map<string, T>();
    for (const item of items) {
      const k = key(item).trim();
      if (!k) continue;
      if (!map.has(k)) map.set(k, item);
    }
    return Array.from(map.values());
  };

  const characters = dedupeBy(parsed.characters, (c) => {
    const id = typeof c.id === "string" ? c.id.trim() : "";
    if (id) return `id:${id}`;
    const name = normalizeCharacterName(c.name);
    if (name) return `name:${name}`;
    const desc = typeof c.descriptor === "string" ? c.descriptor.trim() : "";
    return desc ? `desc:${desc}` : "";
  })
    .map((c) => {
      const id = typeof c.id === "string" && c.id.trim().length > 0 ? c.id.trim() : undefined;
      const rawName = typeof c.name === "string" ? c.name.trim() : "";
      const rawCompact = rawName.replaceAll(" ", "");
      const name = normalizeCharacterName(c.name);
      const nameRevealed = Boolean(
        typeof c.name_revealed === "boolean" ? c.name_revealed && Boolean(name) : Boolean(name)
      );
      let descriptor = typeof c.descriptor === "string" ? c.descriptor.trim() : null;

      // 모델이 name에 대명사/일반명사를 넣고 descriptor를 생략하는 경우가 잦다.
      // name을 버리는 대신 descriptor로 강등해서 캐릭터 레코드가 완전히 사라지지 않게 한다.
      if (!nameRevealed && (!descriptor || descriptor.length === 0) && rawCompact) {
        if (["나", "저", "우리"].includes(rawCompact)) {
          descriptor = "화자(1인칭)";
        } else {
          descriptor = `${rawName}로 지칭되는 인물/존재`;
        }
      }

      descriptor = descriptor && descriptor.trim().length > 0 ? descriptor.trim() : null;
      const firstExcerpt =
        typeof c.first_appearance_excerpt === "string" ? c.first_appearance_excerpt.trim() : null;
      const nameEvidence =
        typeof c.name_evidence_excerpt === "string" ? c.name_evidence_excerpt.trim() : null;

      return {
        ...(id ? { id } : {}),
        name: nameRevealed ? name : null,
        name_revealed: nameRevealed,
        ...(descriptor ? { descriptor } : {}),
        ...(firstExcerpt ? { first_appearance_excerpt: firstExcerpt } : {}),
        ...(nameEvidence && nameRevealed ? { name_evidence_excerpt: nameEvidence } : {}),
        personality: c.personality.trim(),
        ...(typeof c.gender !== "undefined" ? { gender: c.gender ?? null } : {}),
        ...(typeof c.birthday !== "undefined" ? { birthday: c.birthday ?? null } : {}),
      };
    })
    .filter((c) => {
      if (c.name_revealed) return typeof c.name === "string" && c.name.trim().length >= 2;
      return typeof c.descriptor === "string" && c.descriptor.trim().length > 0;
    })
    .slice(0, 10);

  const locations = dedupeBy(parsed.locations, (l) => l.name)
    .map((l) => ({ name: l.name.trim(), situation: l.situation.trim() }))
    .slice(0, 10);

  const plot_seeds = dedupeBy(parsed.plot_seeds, (p) => p.title)
    .map((p) => ({
      title: p.title.trim(),
      detail: p.detail.trim(),
      ...(p.character_ids
        ? {
            character_ids: Array.from(
              new Set(p.character_ids.map((id) => id.trim()).filter(isUuid))
            ).slice(0, 10),
          }
        : {}),
      ...(p.character_names
        ? {
            character_names: Array.from(
              new Set(p.character_names.map((n) => n.trim()).filter(Boolean))
            ).slice(0, 10),
          }
        : {}),
      ...(p.location_names
        ? {
            location_names: Array.from(
              new Set(p.location_names.map((n) => n.trim()).filter(Boolean))
            ).slice(0, 10),
          }
        : {}),
    }))
    .slice(0, 5);

  return { characters, locations, plot_seeds };
}

function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1)
    throw new AgentError({
      type: "PARSE_ERROR",
      code: "INVALID_JSON",
      message: "Model did not return JSON",
      details: { op: "extract_json", reason: "no_open_brace" },
    });

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = false;
      }

      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      const candidate = text.slice(start, i + 1).trim();

      try {
        return JSON.parse(candidate);
      } catch (err) {
        throw AgentError.fromUnknown(err, {
          type: "PARSE_ERROR",
          code: "INVALID_JSON",
          messagePrefix: "JSON.parse",
          details: { op: "extract_json", reason: "parse_failed" },
        });
      }
    }
  }

  throw new AgentError({
    type: "PARSE_ERROR",
    code: "INVALID_JSON",
    message: "Model returned incomplete JSON",
    details: { op: "extract_json", reason: "unclosed_brace" },
  });
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
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  const message = getErrorMessage(err).toLowerCase();

  if (message.includes("overloaded") || message.includes("unavailable")) return true;
  if (message.includes("quota") || message.includes("resource_exhausted")) return true;
  if (message.includes("\"code\":429") || message.includes("\"code\":503")) return true;
  if (message.includes("gemini returned empty text")) return true;

  // Network / client-side timeouts (e.g. TimeoutError from fetch)
  if (message.includes("timeout") || message.includes("timed out")) return true;
  if (message.includes("deadline") && message.includes("exceed")) return true;
  if (message.includes("deadline") && message.includes("expired")) return true;

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

      await Bun.sleep(Math.min(120_000, delayMs));
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
  previousEpisode?:
    | {
        episode_no: number;
        story_time: string | null;
        content_tail: string;
      }
    | null;
  revisionInstruction?: string;
  // When true, disables tool-calling and relies only on provided context.
  disableTools?: boolean;
  prefetchedContext?: string;
  // Output length control (token-based, model dependent).
  maxOutputTokens?: number;
}): Promise<GenerateResult> {
  const systemInstructionBase = (params.disableTools
    ? systemPromptCompact
    : systemPrompt
  ).trim();
  const systemInstruction = params.disableTools
    ? [
        systemInstructionBase,
        "",
        "[추가 규칙]",
        "- 이번 실행에서는 tool 호출이 비활성화되어 있다.",
        "- 아래 사용자 메시지에 필요한 DB 스냅샷이 제공되므로, 그것만으로 집필하라.",
      ].join("\n")
    : systemInstructionBase;

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      tools: params.disableTools ? [] : [params.tool],
      toolConfig: {
        functionCallingConfig: {
          mode: params.disableTools
            ? FunctionCallingConfigMode.NONE
            : FunctionCallingConfigMode.AUTO,
        },
      },
      systemInstruction,
      // We want high rule adherence (JSON-only, no meta labels) over creativity.
      temperature: 0,
      ...(typeof params.maxOutputTokens === "number" && Number.isFinite(params.maxOutputTokens)
        ? { maxOutputTokens: Math.max(1, Math.floor(params.maxOutputTokens)) }
        : {}),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          episode_content: { type: Type.STRING },
          resolved_plot_seed_ids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["episode_content"],
        propertyOrdering: ["episode_content", "resolved_plot_seed_ids"],
      },
    },
  });

  const previousEpisode = params.previousEpisode ?? null;

  const baseMessage = renderTemplate(userPromptTemplate, {
    novelId: params.novelId,
    episodeNo: String(params.episodeNo),
    maxEpisodeNo: String(params.maxEpisodeNo),
    previousEpisodeNo: previousEpisode ? String(previousEpisode.episode_no) : "",
    previousEpisodeStoryTime: previousEpisode?.story_time ?? "",
    previousEpisodeContentTail: previousEpisode?.content_tail ?? "",
  }).trim();

  const prefetchedContext =
    typeof params.prefetchedContext === "string" &&
    params.prefetchedContext.trim().length > 0
      ? params.prefetchedContext.trim().slice(0, 10_000)
      : "";

  const messageCore = params.revisionInstruction
    ? `${baseMessage}\n\n수정 지시:\n${params.revisionInstruction}`
    : baseMessage;

  const message = prefetchedContext
    ? `${messageCore}\n\n[미리 조회된 DB 스냅샷]\n---\n${prefetchedContext}\n---`
    : messageCore;

  const retryMessage = retryPrompt.trim();

  let lastEpisodeContent: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await sendGeminiWithRetry({
      maxAttempts: 5,
      send: async () => {
        const retryWithContext = lastEpisodeContent
          ? `${retryMessage}\n\n[직전 출력(회차 라벨/메타 제거 대상)]\n---\n${lastEpisodeContent}\n---`
          : retryMessage;
        const next = await chat.sendMessage({
          message:
            attempt === 1
              ? message
              : `${message}\n\n[재시도 지시]\n${retryWithContext}`,
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

      try {
        const repairedJson = extractFirstJsonObject(repairedText);
        generated = parseGenerateResult(repairedJson);
      } catch (repairErr) {
        const jsonOnlyRepairPrompt = renderTemplate(repairPromptTemplate, {
          issues:
            "반드시 JSON만 출력하세요. 마크다운/설명/텍스트 금지.\n\n" +
            `에러: ${String(repairErr)}`,
        }).trim();

        const jsonOnly = await sendGeminiWithRetry({
          maxAttempts: 2,
          send: async () => {
            const next = await chat.sendMessage({
              message: jsonOnlyRepairPrompt,
              config: {
                responseMimeType: "application/json",
                 responseSchema: {
                   type: Type.OBJECT,
                   properties: {
                     episode_content: { type: Type.STRING },
                     resolved_plot_seed_ids: {
                       type: Type.ARRAY,
                       items: { type: Type.STRING },
                     },
                   },
                   required: ["episode_content"],
                   propertyOrdering: [
                     "episode_content",
                     "resolved_plot_seed_ids",
                   ],
                 },
                tools: [],
                toolConfig: {
                  functionCallingConfig: {
                    mode: FunctionCallingConfigMode.NONE,
                  },
                },
              },
            });

            const jsonOnlyText = next.text;
            if (typeof jsonOnlyText !== "string" || jsonOnlyText.trim().length === 0)
              throw new AgentError({
                type: "UPSTREAM_API_ERROR",
                code: "UNAVAILABLE",
                message: "Gemini returned empty text",
                retryable: true,
                details: { op: "chat.sendMessage", kind: "json_only_repair" },
              });

            return next;
          },
        });

        const jsonOnlyText = jsonOnly.text;
        if (typeof jsonOnlyText !== "string" || jsonOnlyText.trim().length === 0)
          throw new AgentError({
            type: "UPSTREAM_API_ERROR",
            code: "UNAVAILABLE",
            message: "Gemini returned empty text",
            retryable: true,
            details: { op: "chat.sendMessage", kind: "json_only_repair" },
          });

        const jsonOnlyParsed = extractFirstJsonObject(jsonOnlyText);
        generated = parseGenerateResult(jsonOnlyParsed);
      }
    }

    if (!containsEpisodeMeta(generated.episode_content)) return generated;

    lastEpisodeContent = generated.episode_content;

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

export async function extractEpisodeFacts(params: {
  ai: GoogleGenAI;
  model: string;
  episodeContent: string;
}): Promise<string[]> {
  const systemInstruction = extractFactsPrompt.trim();

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          facts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["facts"],
        propertyOrdering: ["facts"],
      },
      tools: [],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
    },
  });

  const prompt = [
    "[새 에피소드 본문]",
    "---",
    params.episodeContent,
    "---",
  ].join("\n");

  const response = await sendGeminiWithRetry({
    maxAttempts: 5,
    send: async () => {
      return await chat.sendMessage({ message: prompt });
    },
  });
  const text = response.text;
  if (typeof text !== "string" || text.trim().length === 0)
    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "UNAVAILABLE",
      message: "Gemini returned empty text",
      retryable: true,
      details: { op: "extractEpisodeFacts" },
    });

  const json = extractFirstJsonObject(text);
  const parsed = parseExtractFactsResult(json);
  return parsed.facts;
}

export async function extractEpisodeEntities(params: {
  ai: GoogleGenAI;
  model: string;
  storyBible?: string;
  prefetchedContext?: string;
  episodeContent: string;
}): Promise<ExtractEntitiesResult> {
  const systemInstruction = extractEntitiesPrompt.trim();

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                name_revealed: { type: Type.BOOLEAN },
                descriptor: { type: Type.STRING },
                first_appearance_excerpt: { type: Type.STRING },
                name_evidence_excerpt: { type: Type.STRING },
                personality: { type: Type.STRING },
                gender: { type: Type.STRING },
                birthday: { type: Type.STRING },
              },
              required: ["personality"],
            },
          },
          locations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                situation: { type: Type.STRING },
              },
              required: ["name", "situation"],
            },
          },
          plot_seeds: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                character_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                character_names: { type: Type.ARRAY, items: { type: Type.STRING } },
                location_names: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["title", "detail"],
            },
          },
        },
        required: ["characters", "locations", "plot_seeds"],
        propertyOrdering: ["characters", "locations", "plot_seeds"],
      },
      tools: [],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
    },
  });

  const storyBible = (params.storyBible ?? "").trim();
  const prefetched = (params.prefetchedContext ?? "").trim();
  const prompt = [
    storyBible ? "[story_bible]\n---\n" + storyBible.slice(0, 3000) + "\n---" : "[story_bible]\n(없음)",
    prefetched ? "\n[현재 DB 스냅샷]\n---\n" + prefetched.slice(0, 3000) + "\n---" : "\n[현재 DB 스냅샷]\n(없음)",
    "\n[새 에피소드 본문]",
    "---",
    params.episodeContent,
    "---",
  ].join("\n");

  const response = await sendGeminiWithRetry({
    maxAttempts: 5,
    send: async () => {
      return await chat.sendMessage({ message: prompt });
    },
  });
  const text = response.text;
  if (typeof text !== "string" || text.trim().length === 0)
    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "UNAVAILABLE",
      message: "Gemini returned empty text",
      retryable: true,
      details: { op: "extractEpisodeEntities" },
    });

  const json = extractFirstJsonObject(text);
  return parseExtractEntitiesResult(json);
}

export async function extractStoryTimeFromEpisode(params: {
  ai: GoogleGenAI;
  model: string;
  previousStoryTime?: string | null;
  episodeContent: string;
}): Promise<string> {
  const systemInstruction = extractStoryTimePrompt.trim();

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          story_time: { type: Type.STRING },
        },
        required: ["story_time"],
        propertyOrdering: ["story_time"],
      },
      tools: [],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
    },
  });

  const previous = typeof params.previousStoryTime === "string" ? params.previousStoryTime : "";

  const pad2 = (n: number) => String(n).padStart(2, "0");

  const extractTimeOfDay = (text: string): { hour: number; minute: number } | null => {
    const normalized = text.replaceAll("\n", " ");

    if (normalized.includes("정오")) return { hour: 12, minute: 0 };
    if (normalized.includes("자정")) return { hour: 0, minute: 0 };

    const m = normalized.match(
      /(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/,
    );
    if (!m) return null;

    const ampm = m[1];
    const hRaw = Number(m[2]);
    const minRaw = m[3] ? Number(m[3]) : 0;
    if (!Number.isFinite(hRaw) || !Number.isFinite(minRaw)) return null;

    let hour = hRaw;
    const minute = minRaw;

    if (ampm === "오전") {
      if (hour === 12) hour = 0;
    } else {
      if (hour >= 1 && hour <= 11) hour += 12;
    }

    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;
    return { hour, minute };
  };

  const promptBase = [
    "[직전 story_time]",
    previous || "(없음)",
    "\n[새 에피소드 본문]",
    "---",
    params.episodeContent,
    "---",
  ].join("\n");

  const validate = (candidate: string): string => {
    const iso = normalizeStoryTimeIso(candidate);
    const prevMs = previous ? Date.parse(previous) : Number.NaN;
    if (Number.isFinite(prevMs)) {
      const nextMs = Date.parse(iso);
      if (!Number.isFinite(nextMs) || nextMs <= prevMs)
        throw new AgentError({
          type: "VALIDATION_ERROR",
          code: "INVALID_ARGUMENT",
          message: "story_time must be after previous story_time",
          details: { previousStoryTime: previous, storyTime: candidate },
        });
    }
    return iso;
  };

  // Prefer deterministic parsing when the episode explicitly states a time-of-day.
  const baseForDate = previous.trim()
    ? normalizeStoryTimeIso(previous.trim())
    : normalizeStoryTimeIso(new Date().toISOString());
  const baseDate = baseForDate.slice(0, 10); // YYYY-MM-DD

  const parsedTime = extractTimeOfDay(params.episodeContent);
  if (parsedTime) {
    try {
      const candidate = `${baseDate}T${pad2(parsedTime.hour)}:${pad2(parsedTime.minute)}:00+09:00`;
      return validate(candidate);
    } catch {
      // fall through to model-based extraction
    }
  }

  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await sendGeminiWithRetry({
        maxAttempts: 5,
        send: async () => {
          const next = await chat.sendMessage({
            message:
              attempt === 1
                ? promptBase
                : [
                    promptBase,
                    "\n[수정 지시]",
                    "- 반드시 ISO 8601 timestamptz 형식으로만 출력",
                    "- 직전 story_time이 있으면 반드시 그보다 미래",
                    "- JSON 객체 1개만 출력",
                  ].join("\n"),
          });

          const text = next.text;
          if (typeof text !== "string" || text.trim().length === 0)
            throw new AgentError({
              type: "UPSTREAM_API_ERROR",
              code: "UNAVAILABLE",
              message: "Gemini returned empty text",
              retryable: true,
              details: { op: "extractStoryTimeFromEpisode" },
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
          details: { op: "extractStoryTimeFromEpisode" },
        });

      const json = extractFirstJsonObject(text);
      const raw = (json as { story_time?: unknown } | null)?.story_time;
      if (typeof raw !== "string")
        throw new AgentError({
          type: "PARSE_ERROR",
          code: "INVALID_JSON",
          message: "Model did not return story_time",
          details: { op: "extractStoryTimeFromEpisode" },
        });

      return validate(raw.trim());
    } catch (err) {
      lastErr = err;
    }
  }

  const prevMs = previous ? Date.parse(previous) : Number.NaN;
  if (Number.isFinite(prevMs))
    return normalizeStoryTimeIso(new Date(prevMs + 5 * 60 * 1000).toISOString());
  if (lastErr) throw lastErr;
  return normalizeStoryTimeIso(new Date().toISOString());
}

function normalizeReviewSeverity(
  value: string
): "low" | "medium" | "high" {
  const v = value.trim().toLowerCase();

  if (
    v === "high" ||
    v === "critical" ||
    v === "severe" ||
    v === "major" ||
    v === "상" ||
    v === "높음"
  )
    return "high";

  if (
    v === "medium" ||
    v === "moderate" ||
    v === "mid" ||
    v === "중" ||
    v === "보통"
  )
    return "medium";

  if (v === "low" || v === "minor" || v === "하" || v === "낮음") return "low";

  return "medium";
}

const ReviewIssueSchema = z
  .object({
    severity: z
      .string()
      .transform((v) => normalizeReviewSeverity(v)),
    description: z.string().transform((v) => v.trim()),
  })
  .strict();

type ReviewResult = {
  passed: boolean;
  issues: Array<z.infer<typeof ReviewIssueSchema>>;
  revision_instruction?: string;
};

const ReviewResultSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(ReviewIssueSchema).default([]),
    revision_instruction: z
      .string()
      .transform((v) => v.trim())
      .optional(),
  })
  .strict();

export async function reviewEpisodeContinuity(params: {
  ai: GoogleGenAI;
  model: string;
  previousEpisodes: Array<{ episode_no: number; story_time: string | null; content_tail: string }>;
  draft: EpisodeDraft;
}): Promise<ReviewResult> {
  const previous = params.previousEpisodes
    .slice()
    .sort((a, b) => a.episode_no - b.episode_no)
    .map((e) => {
      // NOTE: We intentionally omit story_time from reviewer input to avoid timezone misreads.
      return `에피소드 ${e.episode_no}\n---\n${e.content_tail}\n---`;
    })
    .join("\n\n");

  const systemInstruction = [
    "너는 연재 소설의 연속성 검토자다. 너의 임무는 '검토'이며, 새 내용을 창작하지 않는다.",
    "입력: 이전 2개 에피소드(끝부분 발췌) + 새 에피소드 초안 전체.",
    "출력: 오직 JSON 객체 1개만 (마크다운/설명문/코드블록 금지).",
    "JSON 스키마:",
    "- passed: boolean",
    "- issues: { severity: 'low'|'medium'|'high', description: string }[]",
    "- revision_instruction?: string",
    "규칙:",
    "- passed=true는 issues가 빈 배열([])일 때만 가능. 조금이라도 문제/의심이 있으면 passed=false.",
    "- severity는 반드시 소문자 'low'|'medium'|'high' 중 하나.",
    "- description는 근거가 되도록 구체적으로 (어떤 불연속인지 + 왜 문제인지).",
    "- passed=false면 revision_instruction에 '작가에게 전달할 수정 지시'를 단계별로 작성.",
    "- passed=true면 revision_instruction은 생략하거나 빈 문자열.",
    "검토 체크리스트:",
    "1) 첫 장면 연결: 새 초반이 직전 회차 마지막 장면/대사/행동의 즉시 결과인가?",
    "   - 프롤로그/세계관 소개/상황 요약으로 리셋하며 시작하면 반드시 passed=false.",
    "2) 시간/장소: 시간 점프/장소 이동이 있다면 전환 과정이 서술되는가?",
    "3) 인물 상태: 부상/감정/목표/관계가 갑자기 바뀌지 않는가?",
    "4) 새 사건/인물: 전조 없이 뜬금 사건/중요 인물 등장/중요 설정 추가가 없는가?",
    "5) 미해결 훅: 직전 긴장/갈등(예: 의문의 전화)이 무시되지 않는가?",
    "revision_instruction 작성 가이드:",
    "- '새 에피소드 첫 문단을 직전 마지막 액션의 반응으로 시작'처럼 바로 적용 가능한 지시",
    "- 필요하면 '추가해야 할 연결 문단/장면'을 명시",
  ].join("\n");

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          passed: { type: Type.BOOLEAN },
          issues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["severity", "description"],
            },
          },
          revision_instruction: { type: Type.STRING },
        },
        required: ["passed", "issues"],
        propertyOrdering: ["passed", "issues", "revision_instruction"],
      },
      tools: [],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
    },
  });

  const prompt = [
    "[이전 에피소드들]",
    previous || "(없음)",
    "\n[새 에피소드 초안]",
    "---",
    params.draft.episode_content,
    "---",
  ].join("\n");

  const response = await sendGeminiWithRetry({
    maxAttempts: 5,
    send: async () => {
      return await chat.sendMessage({ message: prompt });
    },
  });

  const text = response.text;
  if (typeof text !== "string" || text.trim().length === 0)
    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "UNAVAILABLE",
      message: "Gemini returned empty text",
      retryable: true,
      details: { op: "reviewEpisodeContinuity" },
    });

  const json = extractFirstJsonObject(text);
  const parsed = ReviewResultSchema.parse(json);

  const revisionInstruction = parsed.revision_instruction?.trim();

  // Do not allow "passed=true with issues".
  const passed = parsed.passed && parsed.issues.length === 0;

  return {
    passed,
    issues: parsed.issues,
    ...(revisionInstruction ? { revision_instruction: revisionInstruction } : {}),
  };
}

export async function reviewEpisodeConsistency(params: {
  ai: GoogleGenAI;
  model: string;
  storyBible?: string;
  previousEpisodes: Array<{ episode_no: number; story_time: string | null; content_tail: string }>;
  groundingChunks: Array<{
    kind: "fact" | "episode";
    episode_no: number;
    similarity: number;
    content: string;
  }>;
  extractedFacts: string[];
  draft: EpisodeDraft;
}): Promise<ReviewResult> {
  const previous = params.previousEpisodes
    .slice()
    .sort((a, b) => a.episode_no - b.episode_no)
    .map((e) => {
      // NOTE: We intentionally omit story_time from reviewer input to avoid timezone misreads.
      return `에피소드 ${e.episode_no}\n---\n${e.content_tail}\n---`;
    })
    .join("\n\n");

  const grounding = params.groundingChunks
    .slice()
    .sort((a, b) => {
      if (a.episode_no !== b.episode_no) return a.episode_no - b.episode_no;
      return b.similarity - a.similarity;
    })
    .map((c) => {
      const sim = Number.isFinite(c.similarity) ? c.similarity.toFixed(4) : String(c.similarity);
      return `- (${c.kind}) ep=${c.episode_no} sim=${sim}\n${c.content}`;
    })
    .join("\n\n");

  const extractedFacts = params.extractedFacts.map((f) => `- ${f}`).join("\n");
  const storyBible = (params.storyBible ?? "").trim();

  const systemInstruction = [
    "너는 연재 소설의 설정/사실 충돌 검토자다. 너의 임무는 '검토'이며, 새 내용을 창작하지 않는다.",
    "입력: (1) 직전 1~2개 에피소드 발췌, (2) 과거 에피소드에서 검색된 근거(요약/사실 청크), (3) 이번 에피소드 초안, (4) 이번 에피소드에서 추출된 사실 목록, (5) (선택) story_bible.",
    "출력: 오직 JSON 객체 1개만 (마크다운/설명문/코드블록 금지).",
    "JSON 스키마:",
    "- passed: boolean",
    "- issues: { severity: 'low'|'medium'|'high', description: string }[]",
    "- revision_instruction?: string",
    "규칙:",
    "- passed=true는 issues가 빈 배열([])일 때만 가능. 조금이라도 문제/의심이 있으면 passed=false.",
    "- severity는 반드시 소문자 'low'|'medium'|'high' 중 하나.",
    "- description는 근거가 되도록 구체적으로: (어떤 사실/설정이) (어떤 과거 근거와) (어떻게) 충돌하는지.",
    "- passed=false면 revision_instruction에 '작가에게 전달할 수정 지시'를 단계별로 작성.",
    "- passed=true면 revision_instruction은 생략하거나 빈 문자열.",
    "검토 체크리스트:",
    "1) 이번 에피소드 추출 사실(extracted facts)이 과거 근거(grounding)와 직접 충돌하는가?",
    "2) story_bible이 제공된 경우, story_bible의 규칙/설정/세계관과 모순되는가?",
    "3) 시간/장소/인물 상태(부상/소지품/관계/목표)가 근거 없이 바뀌는가?",
    "4) 모호한 표현으로 인해 사실 해석이 갈리는 경우, 충돌 가능성을 낮추도록 문장을 명확히 하라고 지시할 것.",
    "revision_instruction 작성 가이드:",
    "- 충돌을 해결하는 최소 수정(문장 교정/추가 설명/장면 삽입)으로 지시.",
    "- 불확실하면 '근거 문장(과거 사실)을 존중'하도록 수정 지시.",
  ].join("\n");

  const chat = params.ai.chats.create({
    model: params.model,
    config: {
      systemInstruction,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          passed: { type: Type.BOOLEAN },
          issues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["severity", "description"],
            },
          },
          revision_instruction: { type: Type.STRING },
        },
        required: ["passed", "issues"],
        propertyOrdering: ["passed", "issues", "revision_instruction"],
      },
      tools: [],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
    },
  });

  const prompt = [
    storyBible ? "[story_bible]\n---\n" + storyBible + "\n---" : "[story_bible]\n(없음)",
    "\n[직전 에피소드 발췌]",
    previous || "(없음)",
    "\n[과거 근거(검색 결과)]",
    grounding || "(없음)",
    "\n[이번 에피소드에서 추출된 사실 목록]",
    extractedFacts || "(없음)",
    "\n[새 에피소드 초안]",
    "---",
    params.draft.episode_content,
    "---",
  ].join("\n");

  const response = await sendGeminiWithRetry({
    maxAttempts: 5,
    send: async () => {
      return await chat.sendMessage({ message: prompt });
    },
  });
  const text = response.text;
  if (typeof text !== "string" || text.trim().length === 0)
    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "UNAVAILABLE",
      message: "Gemini returned empty text",
      retryable: true,
      details: { op: "reviewEpisodeConsistency" },
    });

  const json = extractFirstJsonObject(text);
  const parsed = ReviewResultSchema.parse(json);
  const revisionInstruction = parsed.revision_instruction?.trim();

  // Do not allow "passed=true with issues".
  const passed = parsed.passed && parsed.issues.length === 0;

  return {
    passed,
    issues: parsed.issues,
    ...(revisionInstruction ? { revision_instruction: revisionInstruction } : {}),
  };
}

export type {
  GenerateResult,
  ReviewResult,
  ExtractFactsResult,
  ExtractEntitiesResult,
  EpisodeDraft,
};
