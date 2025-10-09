import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { ENV } from '@/env';

import type { ChapterContext, PhaseResult } from '../types/novel';
import { executeMcpTool } from './mcp-client';
import { NOVEL_CONFIG, SYSTEM_PROMPT } from './novel-config';

export class NovelWritingAgent {
  private openai: OpenAI;
  private context: ChapterContext;
  private tools: OpenAI.ChatCompletionTool[];

  constructor(context: ChapterContext, tools: OpenAI.ChatCompletionTool[]) {
    this.openai = new OpenAI({
      apiKey: ENV.NEXT_OPENAI_API_KEY,
    });
    this.context = context;
    this.tools = tools;
  }

  private debug(message: string) {
    console.info(`[${this.context.chapterId}] ${message}`);
  }

  private preview(
    content: string | ChatCompletionContentPart[] | undefined,
    maxLength = 160,
  ): string {
    if (!content) return '(empty)';
    const text = Array.isArray(content)
      ? content
          .map((part) => {
            if (typeof part === 'string') {
              return part;
            }

            if (typeof part === 'object' && part !== null && 'text' in part) {
              const textValue = (part as { text?: unknown }).text;
              if (typeof textValue === 'string') {
                return textValue;
              }
            }

            return JSON.stringify(part);
          })
          .join(' ')
      : content;
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;

    return `${normalized.slice(0, maxLength)}...`;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private upsertCharacter(data: Record<string, unknown>) {
    const name = typeof data.name === 'string' ? data.name.trim() : undefined;
    const id = typeof data.id === 'string' ? data.id : undefined;
    if (!name && !id) return;

    const draft = this.context.draft.characters;
    const index = draft.findIndex((item) => {
      if (id && item.id === id) return true;
      if (!id && name && item.name === name) return true;

      return false;
    });

    const allowedKeys: Array<
      keyof ChapterContext['draft']['characters'][number]
    > = [
      'id',
      'name',
      'personality',
      'background',
      'appearance',
      'current_location',
      'relationships',
      'major_events',
      'character_traits',
      'current_status',
      'first_appeared_at',
      'last_updated',
    ];

    const next: ChapterContext['draft']['characters'][number] = {};
    for (const key of allowedKeys) {
      const value = data[key as string];
      if (value !== undefined) {
        next[key] = value as never;
      }
    }

    if (index >= 0) {
      draft[index] = { ...draft[index], ...next };
    } else {
      draft.push(next);
    }

    this.debug(
      `Tracked character draft: ${this.preview(JSON.stringify(next))}`,
    );
  }

  private upsertPlace(data: Record<string, unknown>) {
    const name = typeof data.name === 'string' ? data.name.trim() : undefined;
    const id = typeof data.id === 'string' ? data.id : undefined;
    if (!name && !id) return;

    const draft = this.context.draft.places;
    const index = draft.findIndex((item) => {
      if (id && item.id === id) return true;
      if (!id && name && item.name === name) return true;

      return false;
    });

    const allowedKeys: Array<keyof ChapterContext['draft']['places'][number]> =
      ['id', 'name', 'current_situation'];

    const next: ChapterContext['draft']['places'][number] = {};
    for (const key of allowedKeys) {
      const value = data[key as string];
      if (value !== undefined) {
        next[key] = value as never;
      }
    }

    if (index >= 0) {
      draft[index] = { ...draft[index], ...next };
    } else {
      draft.push(next);
    }

    this.debug(`Tracked place draft: ${this.preview(JSON.stringify(next))}`);
  }

  private recordToolSideEffects(
    toolName: string,
    args: unknown,
    rawResult: string,
  ) {
    const canonicalName = toolName.replace(/_/g, '.');
    if (
      canonicalName !== 'characters.create' &&
      canonicalName !== 'places.create'
    ) {
      return;
    }

    const argRecord = this.toRecord(args);
    const parsed = this.tryParseJson(rawResult);
    const resultRecord = Array.isArray(parsed)
      ? this.toRecord(parsed[0])
      : this.toRecord(parsed);
    const merged = {
      ...(argRecord ?? {}),
      ...(resultRecord ?? {}),
    };

    if (canonicalName === 'characters.create') {
      this.upsertCharacter(merged);
    } else if (canonicalName === 'places.create') {
      this.upsertPlace(merged);
    }
  }

  // Phase 1: Prewriting (구상)
  async executePrewriting(): Promise<PhaseResult> {
    const prompt = this.buildPrewritingPrompt();
    this.debug(`Prewriting prompt ready: ${this.preview(prompt)}`);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages);
    this.debug(`Prewriting output captured: ${this.preview(output)}`);

    this.context.draft.prewriting = output;

    return {
      success: true,
      phase: 'prewriting',
      output,
      context: this.context,
    };
  }

  // Phase 2: Drafting (작성)
  async executeDrafting(): Promise<PhaseResult> {
    const prompt = this.buildDraftingPrompt();
    this.debug(`Drafting prompt ready: ${this.preview(prompt)}`);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages);
    this.debug(`Draft output captured: ${this.preview(output)}`);

    this.context.draft.content = output;

    return {
      success: true,
      phase: 'drafting',
      output,
      context: this.context,
    };
  }

  // Phase 3: Revision (수정)
  async executeRevision(): Promise<PhaseResult> {
    const prompt = this.buildRevisionPrompt();
    this.debug(`Revision prompt ready: ${this.preview(prompt)}`);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages);
    this.debug(`Revision output captured: ${this.preview(output)}`);

    return {
      success: true,
      phase: 'revision',
      output,
      context: this.context,
    };
  }

  // OpenAI API 호출 with Function Calling
  private async chatWithTools(
    messages: ChatCompletionMessageParam[],
  ): Promise<string> {
    const currentMessages = [...messages];
    const maxIterations = 20; // 무한 루프 방지
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;
      const lastMessage = currentMessages[currentMessages.length - 1];
      if (lastMessage?.role === 'user') {
        this.debug(
          `Iteration ${iterations} user message: ${this.preview(lastMessage.content ?? '')}`,
        );
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5',
        messages: currentMessages,
        tools: this.tools,
      });

      const message = response.choices[0].message;
      currentMessages.push(message);
      this.debug(
        `Iteration ${iterations} model role=${message.role} toolCalls=${message.tool_calls?.length ?? 0}`,
      );

      // Function call이 없으면 최종 응답
      if (!message.tool_calls || message.tool_calls.length === 0) {
        this.debug(
          `Iteration ${iterations} final response: ${this.preview(message.content ?? '')}`,
        );

        return message.content || '';
      }

      // Function calling 실행
      for (const toolCall of message.tool_calls) {
        let currentToolName = 'unknown';
        try {
          // Type guard for function tool calls
          if (toolCall.type !== 'function' || !('function' in toolCall)) {
            continue;
          }

          const fnCall = toolCall.function;
          if (!fnCall) {
            continue;
          }

          currentToolName = fnCall.name;
          const args = JSON.parse(fnCall.arguments);
          this.debug(
            `Calling tool ${currentToolName} with args ${this.preview(fnCall.arguments)}`,
          );
          const result = await executeMcpTool(currentToolName, args);
          this.debug(`Tool ${currentToolName} result: ${this.preview(result)}`);
          this.recordToolSideEffects(currentToolName, args, result);

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'Unknown error';
          this.debug(
            `Tool ${currentToolName} error: ${this.preview(messageText)}`,
          );
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${messageText}`,
          });
        }
      }
    }

    throw new Error('Max iterations reached in chatWithTools');
  }

  // Prewriting 프롬프트 생성
  private buildPrewritingPrompt(): string {
    const parts = [
      '# Phase 1: Prewriting (구상 단계)',
      '',
      `현재 시간: ${this.context.currentTime.toISOString()}`,
      `챕터 ID: ${this.context.chapterId}`,
      '',
    ];

    if (this.context.previousChapter) {
      parts.push('## 이전 챕터 정보');
      parts.push(`ID: ${this.context.previousChapter.id}`);
      parts.push(`작성 시간: ${this.context.previousChapter.created_at}`);
      parts.push('');
      parts.push('### 이전 챕터 내용 (일부)');
      parts.push(this.context.previousChapter.content.slice(0, 1000) + '...');
      parts.push('');
    } else {
      parts.push('## 첫 번째 챕터입니다');
      parts.push('');
    }

    parts.push('## 작업 내용');
    parts.push('다음 챕터를 구상하기 위해:');
    parts.push('');
    parts.push('1. 이전 챕터 분석 (필요시 entries.get 사용)');
    parts.push('2. 주요 캐릭터의 현재 위치 파악');
    parts.push(
      '3. 해당 위치의 실시간 날씨 조회 (geo.gridPlaceWeather) 후 체감 묘사로 활용할 요소 정리',
    );
    parts.push('4. 시간 경과와 이동 가능 거리 계산');
    parts.push('5. 다음 챕터의 주요 사건과 전개 방향 결정');
    parts.push(
      '6. 필요한 새 캐릭터나 장소 구상 및 등장 시 MCP write 도구 사용 계획 수립',
    );
    parts.push('');
    parts.push(
      '구상한 내용을 자세히 설명하되 시간·날씨는 감각적 표현 중심으로 정리하고 수치 나열은 피해주세요. 새 캐릭터나 장소를 확정하면 해당 정보를 DB에 저장하기 위해 `characters.create`, `places.create` 호출 전략도 메모하세요.',
    );

    return parts.join('\n');
  }

  // Drafting 프롬프트 생성
  private buildDraftingPrompt(): string {
    const parts = [
      '# Phase 2: Drafting (본문 작성 단계)',
      '',
      '## Prewriting 구상 내용',
      this.context.draft.prewriting || '(구상 내용 없음)',
      '',
      '## 작업 내용',
      `위 구상을 바탕으로 정확히 ${NOVEL_CONFIG.writingStyle.targetLength}자 분량의 소설 본문을 작성하세요.`,
      '',
      '### 작성 지침',
      '- 시간과 날씨는 인물의 체감, 환경 변화, 대사 등으로 녹이고 숫자·단위 나열은 금지',
      '- 긴장감과 몰입도를 유지하는 전개',
      '- 필요시 새로운 캐릭터나 장소를 자유롭게 추가',
      '- 이전 챕터와의 자연스러운 연결',
      '- 새롭게 등장시키는 캐릭터·장소는 본문에 묘사',
      '- 생생한 묘사와 현실적인 디테일',
      '',
      '작성된 본문만 출력해주세요. (다른 설명 없이)',
    ];

    return parts.join('\n');
  }

  // Revision 프롬프트 생성
  private buildRevisionPrompt(): string {
    const parts = [
      '# Phase 3: Revision (최종 검토 및 수정 단계)',
      '',
      '## 작성된 초고',
      this.context.draft.content || '(초고 없음)',
      '',
      '## 작업 내용',
      '위 초고를 최종 검토하고 수정하세요:',
      '',
      '### 검토 항목',
      '1. 오탈자 및 문법 오류 수정',
      '2. 이전 챕터와의 일관성 확인',
      '3. 캐릭터 행동의 자연스러움 검토',
      '4. 시간·날씨 표현이 감각적으로 유지되는지, 수치 나열이 없는지 확인',
      '5. 묘사와 대화의 질 향상',
      `6. 정확히 ${NOVEL_CONFIG.writingStyle.targetLength}자 분량 조정`,
      '7. 전체적인 흐름과 긴장감 확인',
      '',
      '최종 수정된 본문만 출력해주세요. (다른 설명 없이)',
    ];

    return parts.join('\n');
  }
}
