import type { z } from 'zod';

import { AgentError } from '../../errors/agentError';

export type LLMProvider = 'gemini' | 'glm';

export type GenerateJsonParams<T> = {
  model: string;
  systemInstruction: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  maxParseRetries?: number;
};

export type EmbedTextParams = {
  model: string;
  text: string;
};

export type LLMClientConfig = {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
};

export interface LLMAdapter {
  readonly provider: LLMProvider;

  generateJson<T>(params: GenerateJsonParams<T>): Promise<T>;

  embedText?(params: EmbedTextParams): Promise<number[] | null>;
}

export interface LLMErrorContext {
  provider: LLMProvider;
  operation: 'generateJson' | 'embedText';
  attempt: number;
  error: unknown;
}

export type ShouldRetryFn = (context: LLMErrorContext) => boolean;

export function resolveUpstreamError(
  err: unknown,
  provider: LLMProvider
): AgentError {
  const message = AgentError.messageFromUnknown(err);
  const normalized = message.toLowerCase();
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: number }).status
      : undefined;

  if (status === 429 || normalized.includes('rate limit')) {
    return new AgentError({
      type: 'UPSTREAM_API_ERROR',
      code: 'RATE_LIMITED',
      message: `[${provider}] ${message}`,
      retryable: true,
    });
  }

  if (status === 503 || normalized.includes('unavailable')) {
    return new AgentError({
      type: 'UPSTREAM_API_ERROR',
      code: 'UNAVAILABLE',
      message: `[${provider}] ${message}`,
      retryable: true,
    });
  }

  return AgentError.fromUnknown(err, {
    type: 'UPSTREAM_API_ERROR',
    code: 'UNAVAILABLE',
    messagePrefix: `[${provider}] API failed`,
    retryable: false,
  });
}
