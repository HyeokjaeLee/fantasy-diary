import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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

  // Phase 1: Prewriting (구상)
  async executePrewriting(): Promise<PhaseResult> {
    const prompt = this.buildPrewritingPrompt();
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages);

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
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages);

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
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages);

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

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5',
        messages: currentMessages,
        tools: this.tools,
      });

      const message = response.choices[0].message;
      currentMessages.push(message);

      // Function call이 없으면 최종 응답
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content || '';
      }

      // Function calling 실행
      for (const toolCall of message.tool_calls) {
        try {
          // Type guard for function tool calls
          if (toolCall.type !== 'function') {
            continue;
          }

          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeMcpTool(toolCall.function.name, args);

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        } catch (error) {
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    parts.push('3. 해당 위치의 실시간 날씨 조회 (geo.gridPlaceWeather)');
    parts.push('4. 시간 경과와 이동 가능 거리 계산');
    parts.push('5. 다음 챕터의 주요 사건과 전개 방향 결정');
    parts.push('6. 필요한 새 캐릭터나 장소 구상');
    parts.push('');
    parts.push('구상한 내용을 자세히 설명해주세요.');

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
      '- 제공된 날씨와 시간 정보를 자연스럽게 반영',
      '- 긴장감과 몰입도를 유지하는 전개',
      '- 필요시 새로운 캐릭터나 장소를 자유롭게 추가',
      '- 이전 챕터와의 자연스러운 연결',
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
      '4. 묘사와 대화의 질 향상',
      `5. 정확히 ${NOVEL_CONFIG.writingStyle.targetLength}자 분량 조정`,
      '6. 전체적인 흐름과 긴장감 확인',
      '',
      '최종 수정된 본문만 출력해주세요. (다른 설명 없이)',
    ];

    return parts.join('\n');
  }
}
