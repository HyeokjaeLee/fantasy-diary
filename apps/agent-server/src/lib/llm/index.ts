import { AgentError } from '../../errors/agentError';
import { createGeminiAdapter } from './gemini';
import { createGLMAdapter } from './glm';
import type { LLMAdapter, LLMProvider } from './types';

const DEFAULT_MODEL_BY_PROVIDER: Record<LLMProvider, string> = {
  gemini: 'gemini-3-flash-preview',
  glm: 'glm-5',
};

export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER as LLMProvider | undefined;

  if (provider === 'gemini' || provider === 'glm') {
    return provider;
  }

  return 'gemini';
}

export function createLLMAdapter(provider?: LLMProvider): LLMAdapter {
  const resolvedProvider = provider ?? getLLMProvider();

  switch (resolvedProvider) {
    case 'gemini':
      return createGeminiAdapter();
    case 'glm':
      return createGLMAdapter();
    default:
      throw new AgentError({
        type: 'VALIDATION_ERROR',
        code: 'INVALID_ARGUMENT',
        message: `Unknown LLM provider: ${resolvedProvider}`,
      });
  }
}

export function getDefaultModel(provider?: LLMProvider): string {
  const resolvedProvider = provider ?? getLLMProvider();
  const fromEnv = process.env.LLM_MODEL;

  if (fromEnv) return fromEnv;

  return DEFAULT_MODEL_BY_PROVIDER[resolvedProvider];
}

export { createGeminiAdapter,GeminiAdapter } from './gemini';
export { createGLMAdapter,GLMAdapter } from './glm';
export type { EmbedTextParams,GenerateJsonParams, LLMAdapter, LLMProvider } from './types';
