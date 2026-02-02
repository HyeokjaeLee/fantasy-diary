import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { AgentError } from "../errors/agentError";
import { withExponentialBackoff } from "./backoff";

type JsonSchema = Record<string, unknown>;

type GenerateJsonParams<T> = {
  model: string;
  systemInstruction: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  maxParseRetries?: number;
};

type EmbedTextParams = {
  model: string;
  text: string;
};

const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  jitterRatio: 0.2,
};

function getEnv(key: string): string | undefined {
  return process.env[key];
}

export function createGenAIClient(): GoogleGenAI {
  const apiKey = getEnv("GEMINI_API_KEY") ?? getEnv("GOOGLE_API_KEY");
  if (!apiKey) {
    throw new AgentError({
      type: "VALIDATION_ERROR",
      code: "REQUIRED",
      message: "Missing required env: GEMINI_API_KEY",
    });
  }

  return new GoogleGenAI({ apiKey });
}

function resolveUpstreamError(err: unknown): AgentError {
  const message = AgentError.messageFromUnknown(err);
  const normalized = message.toLowerCase();
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: number }).status
      : undefined;

  if (status === 429 || normalized.includes("rate limit")) {
    return new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "RATE_LIMITED",
      message: message,
      retryable: true,
    });
  }

  if (status === 503 || normalized.includes("unavailable")) {
    return new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "UNAVAILABLE",
      message: message,
      retryable: true,
    });
  }

  return AgentError.fromUnknown(err, {
    type: "UPSTREAM_API_ERROR",
    code: "UNAVAILABLE",
    messagePrefix: "Gemini API failed",
    retryable: false,
  });
}

function shouldRetryGemini(error: unknown, attempt: number, retries: number): boolean {
  const normalized = resolveUpstreamError(error);
  if (!normalized.retryable) return false;
  return attempt < retries;
}

function parseJsonOrThrow(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const sliced = rawText.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        // fall through to error below
      }
    }

    throw new AgentError({
      type: "PARSE_ERROR",
      code: "INVALID_JSON",
      message: "Model output is not valid JSON",
      details: {
        raw_text: rawText,
      },
      cause: error,
    });
  }
}

export async function generateJson<T>(
  client: GoogleGenAI,
  params: GenerateJsonParams<T>
): Promise<T> {
  const maxParseRetries = Math.max(0, params.maxParseRetries ?? 2);
  let lastError: AgentError | null = null;

  for (let attempt = 0; attempt <= maxParseRetries; attempt += 1) {
    const promptSuffix =
      attempt === 0
        ? ""
        : "\n\nReturn only complete, valid JSON. Do not truncate the response.";

    const response = await withExponentialBackoff(
      async () => {
        return client.models.generateContent({
          model: params.model,
          contents: `${params.prompt}${promptSuffix}`,
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: "application/json",
            responseSchema: params.schema.toJSONSchema() as JsonSchema,
            temperature: params.temperature,
            maxOutputTokens: params.maxOutputTokens,
          },
        });
      },
      DEFAULT_RETRY_OPTIONS,
      (error, context) => shouldRetryGemini(error, context.attempt, context.retries)
    ).catch((error) => {
      throw resolveUpstreamError(error);
    });

    const rawText = response.text ?? "";
    try {
      const json = parseJsonOrThrow(rawText);
      return params.schema.parse(json);
    } catch (error) {
      if (error instanceof AgentError) {
        lastError = error;
      } else {
        lastError = new AgentError({
          type: "PARSE_ERROR",
          code: "INVALID_SHAPE",
          message: "Model output JSON did not match schema",
          details: {
            raw_text: rawText,
          },
          cause: error,
        });
      }
    }
  }

  if (lastError) throw lastError;
  throw new AgentError({
    type: "PARSE_ERROR",
    code: "INVALID_JSON",
    message: "Model output is not valid JSON",
  });
}

export async function embedText(
  client: GoogleGenAI,
  params: EmbedTextParams
): Promise<number[] | null> {
  const response = await withExponentialBackoff(
    async () => {
      return client.models.embedContent({
        model: params.model,
        contents: [params.text],
      });
    },
    DEFAULT_RETRY_OPTIONS,
    (error, context) => shouldRetryGemini(error, context.attempt, context.retries)
  ).catch((error) => {
    throw new AgentError({
      type: "UPSTREAM_API_ERROR",
      code: "GEMINI_EMBED_FAILED",
      message: AgentError.messageFromUnknown(error),
      retryable: false,
      cause: error,
    });
  });

  const first = response.embeddings?.[0];
  if (!first || !Array.isArray(first.values)) return null;
  return first.values as number[];
}
