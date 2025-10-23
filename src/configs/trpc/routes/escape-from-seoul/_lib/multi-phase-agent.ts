import {
  type Content,
  createPartFromFunctionResponse,
  type FunctionCall,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  GoogleGenAI,
} from '@google/genai';

import { IS_DEV } from '@/constants';
import { ENV } from '@/env';
import { GeminiModel } from '@/types/gemini';
import { devConsole } from '@/utils/dev-console';

import { executeMcpToolViaTrpc } from './mcp-client';

type AgentMessage = {
  /** 메시지 역할 */
  role: 'system' | 'user';
  /** 메시지 내용 */
  content: string;
};

type GenerationConfig = {
  /** 최대 출력 토큰 수 */
  maxOutputTokens?: number;
  /** 생성의 다양성 (0~2, 기본값 1) */
  temperature?: number;
  /** 누적 확률 샘플링 (0~1) */
  topP?: number;
  /** 상위 K개 선택지만 고려 */
  topK?: number;
  /** 재현 가능성을 위한 시드값 */
  seed?: number;
  /** 생성 중지 시퀀스 */
  stopSequences?: string[];
  /** 반복 억제 페널티 */
  presencePenalty?: number;
  /** 빈도 페널티 */
  frequencyPenalty?: number;
  /** Gemini 2.5 사고 설정 */
  thinkingConfig?: {
    thinkingBudget?: number;
  };
};

type Phase<TContext = unknown> = {
  id: string;
  /** 페이즈 설명 */
  description?: string;
  /** 시스템/사용자 메시지 배열 */
  messages: AgentMessage[];
  /** 사용 가능한 MCP 도구 목록 */
  tools?: FunctionDeclaration[];
  /** 출력 파싱 함수 */
  outputParser?: (output: string, context: TContext) => unknown;
  /** Gemini API 설정 */
  generationConfig?: GenerationConfig;
};

type PhaseExecutionResult = {
  /** 페이즈 고유 식별자 */
  phaseId: string;
  /** 성공 여부 */
  success: boolean;
  /** 원본 AI 출력 */
  rawOutput: string;
  /** 파싱된 출력 */
  parsedOutput?: unknown;
  /** 에러 정보 */
  error?: unknown;
};

interface MultiPhaseAgentOptions {
  /** 컨텍스트 고유 식별자 (로깅용) */
  contextId?: string;
  /** 도구 호출 최대 반복 횟수 (기본값: 20) */
  maxIterations?: number;
  /** conversation을 phase 간에 유지할지 여부 (기본값: false) */
  persistConversation?: boolean;
  /** 디버그 콜백 함수 */
  onDebug?: (message: string) => void;
  /** 페이즈 시작 콜백 함수 */
  onPhaseStart?: (phaseId: string, message: string) => void;
  /** 페이즈 완료 콜백 함수 */
  onPhaseComplete?: (result: PhaseExecutionResult) => void;
}

/**
 * 도구 응답을 정규화하는 유틸 함수
 * @param {string} result - 도구 결과 문자열
 * @returns {Record<string, unknown>} 정규화된 객체
 */
function normalizeToolResponse(result: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(result);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (Array.isArray(parsed)) {
      return { result: parsed };
    }

    return { result: parsed };
  } catch {
    return { result };
  }
}

/**
 * 멀티 페이즈 에이전트 클래스
 *
 * 여러 페이즈를 순차적으로 실행하고 결과를 반환합니다.
 * 각 페이즈는 프롬프트, MCP 도구, 생성 설정을 포함합니다.
 *
 * @template TContext - 컨텍스트 타입
 *
 * @example
 * // 기본 사용법
 * const agent = new MultiPhaseAgent({
 *   contextId: 'task-123',
 *   onPhaseComplete: (result) => console.log(result)
 * });
 *
 * const phases: Phase[] = [
 *   {
 *     id: 'analysis',
 *     messages: [
 *       { role: 'system', content: 'You are an analyst' },
 *       { role: 'user', content: 'Analyze this...' }
 *     ],
 *     generationConfig: { temperature: 0.7 }
 *   }
 * ];
 *
 * const results = await agent.run(phases, {});
 */
export class MultiPhaseAgent<TContext = unknown> {
  private client: GoogleGenAI;
  private options: MultiPhaseAgentOptions;
  private conversation: Content[] = [];

  constructor(options?: MultiPhaseAgentOptions) {
    this.client = new GoogleGenAI({
      apiKey: ENV.NEXT_GOOGLE_GEMINI_API_KEY,
    });

    this.options = {
      maxIterations: 20,
      persistConversation: false,
      ...options,
    };
  }

  private debug(message: string): void {
    const { contextId, onDebug } = this.options;

    const text = contextId ? `[${contextId}] ${message}` : message;

    if (onDebug) onDebug(text);
    else devConsole(text);
  }

  /** Gemini API를 통해 도구 호출을 포함한 멀티턴 대화 수행 */
  private async chatWithTools(
    /** 초기 메시지 배열 */
    messages: AgentMessage[],
    /** 사용 가능한 도구 목록 */
    tools: FunctionDeclaration[],
    /** 생성 설정 */
    generationConfig?: GenerationConfig,
  ): Promise<string> {
    const initialConversation: Content[] = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'user' ? 'user' : 'model',
        parts: [{ text: message.content }],
      }));

    const systemInstruction = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
      .trim();

    if (initialConversation.length === 0) {
      throw new Error('chatWithTools requires at least one user message');
    }

    // persistConversation이 true면 기존 conversation 이어받기
    const conversation: Content[] = this.options.persistConversation
      ? [...this.conversation, ...initialConversation]
      : [...initialConversation];
    let iterations = 0;

    while (iterations < (this.options.maxIterations ?? 20)) {
      iterations += 1;

      const model = IS_DEV ? GeminiModel.FLASH_LITE : GeminiModel.PRO;

      const response = await this.client.models.generateContent({
        model,
        contents: conversation,
        config: {
          systemInstruction:
            systemInstruction.length > 0 ? systemInstruction : undefined,
          tools:
            tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
          toolConfig:
            tools.length > 0
              ? {
                  functionCallingConfig: {
                    mode: FunctionCallingConfigMode.AUTO,
                  },
                }
              : undefined,
          ...generationConfig,
        },
      });

      const functionCalls: FunctionCall[] = response.functionCalls ?? [];
      const candidateContent = response.candidates?.[0]?.content;

      if (candidateContent) {
        conversation.push(candidateContent);
      }

      if (functionCalls.length === 0) {
        const finalText =
          response.text ??
          (candidateContent?.parts
            ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
            .join('')
            .trim() ||
            '');

        // conversation 업데이트 저장
        if (this.options.persistConversation) {
          this.conversation = conversation;
        }

        return finalText;
      }

      // MCP 도구 호출 처리
      for (const call of functionCalls) {
        const toolName = call.name ?? 'unknown';
        const args = call.args ?? {};

        this.debug(`🔧 Calling MCP tool: ${toolName}`);

        let responsePayload: Record<string, unknown>;
        try {
          const result = await executeMcpToolViaTrpc(toolName, args);
          responsePayload = normalizeToolResponse(result);
          this.debug(`✅ MCP tool success: ${toolName}`);
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'Unknown error';
          this.debug(`❌ MCP tool error: ${toolName} - ${messageText}`);
          responsePayload = { error: messageText };
        }

        const functionResponsePart = createPartFromFunctionResponse(
          call.id ?? toolName,
          toolName,
          responsePayload,
        );

        conversation.push({
          role: 'function',
          parts: [functionResponsePart],
        });
      }
    }

    throw new Error(
      `Max iterations (${this.options.maxIterations}) reached in chatWithTools`,
    );
  }

  private async executePhase(phase: Phase<TContext>, context: TContext) {
    const phaseDescription = phase.description || phase.id;
    this.options.onPhaseStart?.(phase.id, phaseDescription);

    try {
      const tools = phase.tools ?? [];
      const generationConfig = phase.generationConfig;

      const rawOutput = await this.chatWithTools(
        phase.messages,
        tools,
        generationConfig,
      );

      let parsedOutput: unknown;
      if (phase.outputParser) {
        try {
          parsedOutput = phase.outputParser(rawOutput, context);
        } catch (parseError) {
          this.debug(
            `⚠️ Output parser error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          );
          // 파싱 실패해도 계속 진행
        }
      }

      const result: PhaseExecutionResult = {
        phaseId: phase.id,
        success: true,
        rawOutput,
        parsedOutput,
      };

      this.options.onPhaseComplete?.(result);

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.debug(`❌ Phase execution error: ${errorMessage}`);

      const result: PhaseExecutionResult = {
        phaseId: phase.id,
        success: false,
        rawOutput: '',
        error: errorMessage,
      };

      this.options.onPhaseComplete?.(result);

      return result;
    }
  }

  async run(phases: Phase<TContext>[], initialContext: TContext) {
    let context = initialContext;
    const results: PhaseExecutionResult[] = [];

    // persistConversation이 true면 conversation 초기화
    if (this.options.persistConversation) {
      this.conversation = [];
    }

    this.debug(`🚀 Starting multi-phase agent with ${phases.length} phase(s)`);

    for (const phase of phases) {
      const result = await this.executePhase(phase, context);

      results.push(result);

      // context 병합: parsedOutput이 객체면 context에 병합
      if (
        result.success &&
        result.parsedOutput &&
        typeof result.parsedOutput === 'object' &&
        !Array.isArray(result.parsedOutput)
      ) {
        context = { ...context, ...result.parsedOutput } as TContext;
      }

      if (!result.success) {
        this.debug(`⚠️ Phase ${phase.id} failed, continuing with next phase`);
      }
    }

    this.debug(`✅ Multi-phase agent completed`);

    return results;
  }
}
