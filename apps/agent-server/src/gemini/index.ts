import type { GoogleGenAI } from "@google/genai";
import { FunctionCallingConfigMode, Type } from "@google/genai";
import { z } from "zod";

import { AgentError } from "../errors/agentError";
import type { GeminiSupabaseTool } from "../tools";
import repairPromptTemplate from "./prompts/repair.md";
import retryPrompt from "./prompts/retry.md";
import systemPrompt from "./prompts/system.md";
import extractFactsPrompt from "./prompts/extract_facts.md";
import userPromptTemplate from "./prompts/user.md";

type GenerateResult = {
  episode_content: string;
  story_time: string;
  resolved_plot_seed_ids?: string[];
};

type ExtractFactsResult = {
  facts: string[];
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

const ExtractFactsResultSchema = z
  .object({
    facts: z
      .array(
        z
          .string()
          .transform((v) => v.trim())
          .refine((v) => v.length > 0, { message: "fact must be non-empty" })
      )
      .max(10)
      .default([]),
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

function parseExtractFactsResult(value: unknown): ExtractFactsResult {
  const parsed = ExtractFactsResultSchema.parse(value);
  const deduped = Array.from(new Set(parsed.facts.map((f) => f.trim()).filter(Boolean)));

  return {
    facts: deduped.slice(0, 10),
  };
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
  previousEpisode?:
    | {
        episode_no: number;
        story_time: string | null;
        content_tail: string;
      }
    | null;
  revisionInstruction?: string;
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

  const previousEpisode = params.previousEpisode ?? null;

  const baseMessage = renderTemplate(userPromptTemplate, {
    novelId: params.novelId,
    episodeNo: String(params.episodeNo),
    maxEpisodeNo: String(params.maxEpisodeNo),
    previousEpisodeNo: previousEpisode ? String(previousEpisode.episode_no) : "",
    previousEpisodeStoryTime: previousEpisode?.story_time ?? "",
    previousEpisodeContentTail: previousEpisode?.content_tail ?? "",
  }).trim();

  const message = params.revisionInstruction
    ? `${baseMessage}\n\n수정 지시:\n${params.revisionInstruction}`
    : baseMessage;

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
                    story_time: { type: Type.STRING },
                    resolved_plot_seed_ids: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ["episode_content", "story_time"],
                  propertyOrdering: [
                    "episode_content",
                    "story_time",
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

  const response = await chat.sendMessage({ message: prompt });
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
  draft: GenerateResult;
}): Promise<ReviewResult> {
  const previous = params.previousEpisodes
    .slice()
    .sort((a, b) => a.episode_no - b.episode_no)
    .map((e) => {
      const storyTime = e.story_time ? `story_time: ${e.story_time}` : "";

      return `에피소드 ${e.episode_no} (${storyTime})\n---\n${e.content_tail}\n---`;
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
    "- severity는 반드시 소문자 'low'|'medium'|'high' 중 하나.",
    "- description는 근거가 되도록 구체적으로 (어떤 불연속인지 + 왜 문제인지).",
    "- passed=false면 revision_instruction에 '작가에게 전달할 수정 지시'를 단계별로 작성.",
    "- passed=true면 revision_instruction은 생략하거나 빈 문자열.",
    "검토 체크리스트:",
    "1) 첫 장면 연결: 새 초반이 직전 회차 마지막 장면/대사/행동의 즉시 결과인가?",
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
    `story_time: ${params.draft.story_time}`,
    "---",
    params.draft.episode_content,
    "---",
  ].join("\n");

  const response = await chat.sendMessage({
    message: prompt,
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

  return {
    passed: parsed.passed,
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
  draft: GenerateResult;
}): Promise<ReviewResult> {
  const previous = params.previousEpisodes
    .slice()
    .sort((a, b) => a.episode_no - b.episode_no)
    .map((e) => {
      const storyTime = e.story_time ? `story_time: ${e.story_time}` : "";

      return `에피소드 ${e.episode_no} (${storyTime})\n---\n${e.content_tail}\n---`;
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
    `story_time: ${params.draft.story_time}`,
    "---",
    params.draft.episode_content,
    "---",
  ].join("\n");

  const response = await chat.sendMessage({ message: prompt });
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

  return {
    passed: parsed.passed,
    issues: parsed.issues,
    ...(revisionInstruction ? { revision_instruction: revisionInstruction } : {}),
  };
}

export type { GenerateResult, ReviewResult, ExtractFactsResult };
