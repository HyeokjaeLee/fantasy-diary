import { GoogleGenAI } from '@google/genai';

import { AgentError } from '../../errors/agentError';
import { withExponentialBackoff } from '../backoff';
import type {
  EmbedTextParams,
  GenerateJsonParams,
  LLMAdapter,
} from './types';
import { resolveUpstreamError } from './types';

type JsonSchema = Record<string, unknown>;

const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  jitterRatio: 0.2,
};

function shouldRetryGemini(
  error: unknown,
  attempt: number,
  retries: number
): boolean {
  const normalized = resolveUpstreamError(error, 'gemini');
  if (!normalized.retryable) return false;

  return attempt < retries;
}

function parseJsonOrThrow(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const sliced = rawText.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        // fall through to error below
      }
    }

    throw new AgentError({
      type: 'PARSE_ERROR',
      code: 'INVALID_JSON',
      message: 'Model output is not valid JSON',
      details: {
        raw_text: rawText,
      },
      cause: error,
    });
  }
}

export class GeminiAdapter implements LLMAdapter {
  readonly provider = 'gemini' as const;

  constructor(private readonly client: GoogleGenAI) {}

  static fromApiKey(apiKey: string): GeminiAdapter {
    return new GeminiAdapter(new GoogleGenAI({ apiKey }));
  }

  async generateJson<T>(params: GenerateJsonParams<T>): Promise<T> {
    const maxParseRetries = Math.max(0, params.maxParseRetries ?? 2);
    let lastError: AgentError | null = null;

    for (let attempt = 0; attempt <= maxParseRetries; attempt += 1) {
      const promptSuffix =
        attempt === 0
          ? ''
          : '\n\nReturn only complete, valid JSON. Do not truncate the response.';

      const response = await withExponentialBackoff(
        async () => {
          return this.client.models.generateContent({
            model: params.model,
            contents: `${params.prompt}${promptSuffix}`,
            config: {
              systemInstruction: params.systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: params.schema.toJSONSchema() as JsonSchema,
              temperature: params.temperature,
              maxOutputTokens: params.maxOutputTokens,
            },
          });
        },
        DEFAULT_RETRY_OPTIONS,
        (error, context) =>
          shouldRetryGemini(error, context.attempt, context.retries)
      ).catch((error) => {
        throw resolveUpstreamError(error, 'gemini');
      });

      const rawText = response.text ?? '';
      try {
        const json = parseJsonOrThrow(rawText);

        return params.schema.parse(json);
      } catch (error) {
        if (error instanceof AgentError) {
          lastError = error;
        } else {
          lastError = new AgentError({
            type: 'PARSE_ERROR',
            code: 'INVALID_SHAPE',
            message: 'Model output JSON did not match schema',
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
      type: 'PARSE_ERROR',
      code: 'INVALID_JSON',
      message: 'Model output is not valid JSON',
    });
  }

  async embedText(params: EmbedTextParams): Promise<number[] | null> {
    const response = await withExponentialBackoff(
      async () => {
        return this.client.models.embedContent({
          model: params.model,
          contents: [params.text],
        });
      },
      DEFAULT_RETRY_OPTIONS,
      (error, context) =>
        shouldRetryGemini(error, context.attempt, context.retries)
    ).catch((error) => {
      throw new AgentError({
        type: 'UPSTREAM_API_ERROR',
        code: 'GEMINI_EMBED_FAILED',
        message: AgentError.messageFromUnknown(error),
        retryable: false,
        cause: error,
      });
    });

    const first = response.embeddings?.[0];
    if (!first || !Array.isArray(first.values)) return null;

    return first.values as number[];
  }
}

export function createGeminiAdapter(): GeminiAdapter {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new AgentError({
      type: 'VALIDATION_ERROR',
      code: 'REQUIRED',
      message: 'Missing required env: GEMINI_API_KEY or GOOGLE_API_KEY',
    });
  }

  return GeminiAdapter.fromApiKey(apiKey);
}
