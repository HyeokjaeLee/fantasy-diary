import type { GoogleGenAI } from "@google/genai";
import { FunctionCallingConfigMode } from "@google/genai";
import { z } from "zod";

import type { GeminiSupabaseTool } from "../tools";

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
    throw new Error("Model did not return JSON");
  const candidate = text.slice(first, last + 1).trim();

  return JSON.parse(candidate);
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

  throw new Error("Unreachable");
}

export async function generateEpisodeWithTools(params: {
  ai: GoogleGenAI;
  model: string;
  tool: GeminiSupabaseTool;
  novelId: string;
  episodeNo: number;
  maxEpisodeNo: number;
}): Promise<GenerateResult> {
  const systemInstruction = [
    "너는 연재 소설 작가 AI다.",
    "너의 목표는 다음 회차(약 1분 분량)를 한국어로 작성하는 것이다.",
    "필요한 정보는 반드시 tools를 통해 Supabase에서 읽어라. 추측 금지.",
    "최소한 다음은 tool로 확인해라:",
    "- novels: title/genre/story_bible(성경)",
    "- characters, locations: 있으면 설정으로 사용",
    "- plot_seeds(status=open): 있으면 떡밥으로 사용",
    "- episodes: 필요한 과거 회차 원문(일관성 유지 목적)",
    "novels.story_bible가 비어있지 않으면 그 내용이 작품의 성경이다.",
    "story_bible은 Markdown 텍스트다. 내용을 해석해 세계관/규칙/캐스트/플롯을 일관되게 유지해라.",
    "characters/locations/plot_seeds가 비어 있어도 novels.story_bible의 정보를 우선 사용해 세계관을 세팅해라.",
    "캐릭터/장소/떡밥은 반드시 필요할 때만 생성/업데이트하라(등장/언급/서사적으로 의미가 생길 때). 가능한 한 먼저 novels.story_bible와 기존 DB 데이터를 재사용하라.",
    "정말로 필요할 때만 아래 write tools를 사용해라(최소 호출): upsert_character, upsert_location, insert_plot_seed.",
    "insert_plot_seed를 호출할 때 관련 캐릭터/장소가 있으면 character_names/location_names를 함께 넘겨 조인 테이블을 연결해라.",
    "novels.story_bible는 변경하지 마라. story_bible은 기획서(성경)로 고정이다.",
    "메타 표현 금지: 본문에 '1회차/2회차/1화/2화/지난 회차/이전 회차/전 회차/지난 화/이전 화/전편' 같은 회차 라벨을 절대 쓰지 마라.",
    "과거 사건은 '지난밤/아까/조금 전/그때'처럼 이야기 안에서 자연스럽게 이어서 써라.",
    "출력은 반드시 JSON만 허용한다(마크다운/코드펜스 금지).",
    "story_time은 이 회차의 '스토리 진행 시간'이다(ISO 8601 timestamp). 시간 순서를 유지해라.",
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

      const repairPrompt = [
        "직전 출력(JSON)이 스키마 검증에 실패했다.",
        "아래 에러를 참고해서, 반드시 스키마에 맞는 JSON만 다시 출력해라.",
        "- 코드펜스/마크다운/설명 금지. JSON 객체 1개만 출력.",
        "- story_time은 KST(+09:00) 오프셋이 포함된 ISO 8601 timestamp로 써라.",
        "",
        "스키마:",
        '{\n  "episode_content": string,\n  "story_time": string,\n  "resolved_plot_seed_ids"?: string[]\n}',
        "",
        zodIssues ? `Zod 에러:\n${zodIssues}` : `에러: ${String(err)}`,
      ].join("\n");

      const repaired = await sendGeminiWithRetry({
        maxAttempts: 3,
        send: async () => {
          const next = await chat.sendMessage({ message: repairPrompt });

          const repairedText = next.text;
          if (typeof repairedText !== "string" || repairedText.trim().length === 0)
            throw new Error("Gemini returned empty text");

          return next;
        },
      });

      const repairedText = repaired.text;
      if (typeof repairedText !== "string" || repairedText.trim().length === 0)
        throw new Error("Gemini returned empty text");

      const repairedJson = extractFirstJsonObject(repairedText);
      generated = parseGenerateResult(repairedJson);
    }

    if (!containsEpisodeMeta(generated.episode_content)) return generated;

    if (attempt === 2) throw new Error("Generated episode contains episode-label meta references");
  }

  throw new Error("Unreachable");
}

export type { GenerateResult };
