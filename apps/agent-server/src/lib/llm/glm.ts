import { AgentError } from '../../errors/agentError';
import { withExponentialBackoff } from '../backoff';
import type { EmbedTextParams, GenerateJsonParams, LLMAdapter } from './types';
import { resolveUpstreamError } from './types';

const GLM_API_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  jitterRatio: 0.2,
};

function shouldRetryGLM(
  error: unknown,
  attempt: number,
  retries: number
): boolean {
  const normalized = resolveUpstreamError(error, 'glm');
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

type GLMChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type GLMChatResponse = {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export class GLMAdapter implements LLMAdapter {
  readonly provider = 'glm' as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = GLM_API_BASE_URL
  ) {}

  static fromApiKey(
    apiKey: string,
    baseUrl?: string
  ): GLMAdapter {
    return new GLMAdapter(apiKey, baseUrl);
  }

  private async chatCompletion(
    model: string,
    messages: GLMChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: 'json_object' };
    }
  ): Promise<GLMChatResponse> {
    const response = await withExponentialBackoff(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300_000);

        try {
          const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: options?.temperature,
              response_format: options?.responseFormat,
              thinking: { type: 'enabled' },
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            throw new AgentError({
              type: 'UPSTREAM_API_ERROR',
              code: 'GLM_API_ERROR',
              message: `GLM API error: ${res.status} ${res.statusText} - ${errorText}`,
              retryable: res.status === 429 || res.status >= 500,
            });
          }

          return res.json() as Promise<GLMChatResponse>;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      DEFAULT_RETRY_OPTIONS,
      (error, context) =>
        shouldRetryGLM(error, context.attempt, context.retries)
    ).catch((error) => {
      throw resolveUpstreamError(error, 'glm');
    });

    return response;
  }

  async generateJson<T>(params: GenerateJsonParams<T>): Promise<T> {
    const maxParseRetries = Math.max(0, params.maxParseRetries ?? 2);
    let lastError: AgentError | null = null;

    const schemaJson = JSON.stringify(params.schema.toJSONSchema(), null, 2);

    const systemWithSchema = `${params.systemInstruction}

IMPORTANT: You must respond with a JSON object that exactly matches this schema:
${schemaJson}

Do not add any fields not in the schema. Do not change field names.`;

    const messages: GLMChatMessage[] = [
      {
        role: 'system',
        content: systemWithSchema,
      },
      {
        role: 'user',
        content: params.prompt,
      },
    ];

    for (let attempt = 0; attempt <= maxParseRetries; attempt += 1) {
      const attemptMessages =
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: 'user' as const,
                content:
                  'Return only complete, valid JSON. Do not truncate the response.',
              },
            ];

      const response = await this.chatCompletion(params.model, attemptMessages, {
        temperature: params.temperature,
        maxTokens: params.maxOutputTokens,
        responseFormat: { type: 'json_object' },
      });

      let rawText = response.choices[0]?.message?.content ?? '';
      const reasoningContent = response.choices[0]?.message?.reasoning_content;
      
      console.error(`[GLM] finish_reason=${response.choices[0]?.finish_reason}, content_length=${rawText.length}, reasoning_length=${reasoningContent?.length ?? 0}`);
      
      if (!rawText && reasoningContent) {
        console.error(`[GLM] WARNING: content is empty but reasoning exists. Extracting JSON from reasoning...`);
        const jsonMatch = reasoningContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          rawText = jsonMatch[0];
          console.error(`[GLM] Extracted JSON from reasoning: ${rawText.slice(0, 100)}...`);
        }
      }
      
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

  async embedText(_params: EmbedTextParams): Promise<number[] | null> {
    throw new AgentError({
      type: 'VALIDATION_ERROR',
      code: 'NOT_SUPPORTED',
      message:
        'GLM adapter does not support embedding. Use Gemini for embeddings.',
    });
  }
}

export function createGLMAdapter(): GLMAdapter {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new AgentError({
      type: 'VALIDATION_ERROR',
      code: 'REQUIRED',
      message: 'Missing required env: GLM_API_KEY',
    });
  }

  const baseUrl = process.env.GLM_API_BASE_URL ?? GLM_API_BASE_URL;

  return GLMAdapter.fromApiKey(apiKey, baseUrl);
}
