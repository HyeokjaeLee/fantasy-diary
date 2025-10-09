import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    );
  }

  private stringOr(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private stringArrayOr(value: unknown, fallback: string[] = []): string[] {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const items = value
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((item): item is string => item !== null);

    return items.length > 0 ? items : fallback;
  }

  private mergeCharacterReference(
    source: Record<string, unknown>,
    fallback?: EscapeFromSeoulCharacters,
  ): EscapeFromSeoulCharacters | null {
    const base = fallback ?? null;
    const id = this.stringOr(source.id, base?.id ?? '').trim();
    const name = this.stringOr(source.name, base?.name ?? '').trim();
    if (!id || !name) {
      return null;
    }
    const nowIso = new Date().toISOString();
    const firstAppeared = this.stringOr(
      source.first_appeared_at,
      base?.first_appeared_at ?? '',
    );
    const lastUpdated = this.stringOr(
      source.last_updated,
      base?.last_updated ?? '',
    );

    return {
      id,
      name,
      personality: this.stringOr(source.personality, base?.personality ?? ''),
      background: this.stringOr(source.background, base?.background ?? ''),
      appearance: this.stringOr(source.appearance, base?.appearance ?? ''),
      current_location: this.stringOr(
        source.current_location,
        base?.current_location ?? '',
      ),
      relationships:
        source.relationships !== undefined
          ? source.relationships
          : base?.relationships ?? [],
      major_events: this.stringArrayOr(
        source.major_events,
        base?.major_events ?? [],
      ),
      character_traits: this.stringArrayOr(
        source.character_traits,
        base?.character_traits ?? [],
      ),
      current_status: this.stringOr(
        source.current_status,
        base?.current_status ?? '',
      ),
      first_appeared_at: firstAppeared || base?.first_appeared_at || nowIso,
      last_updated: lastUpdated || base?.last_updated || nowIso,
    };
  }

  private mergePlaceReference(
    source: Record<string, unknown>,
    fallback?: EscapeFromSeoulPlaces,
  ): EscapeFromSeoulPlaces | null {
    const base = fallback ?? null;
    const id = this.stringOr(source.id, base?.id ?? '').trim();
    const name = this.stringOr(source.name, base?.name ?? '').trim();
    if (!id || !name) {
      return null;
    }

    return {
      id,
      name,
      current_situation: this.stringOr(
        source.current_situation,
        base?.current_situation ?? '',
      ),
    };
  }

  private summarizeReferences(): {
    characters: string[];
    places: string[];
  } {
    const characterLines: string[] = [];
    const placeLines: string[] = [];
    const maxItems = 20;

    if (this.context.references.characters.length === 0) {
      characterLines.push('- (등록된 캐릭터 없음 → 새 인물을 창작해야 합니다)');
    } else {
      this.context.references.characters
        .slice(0, maxItems)
        .forEach((character) => {
          const summary: string[] = [];
          if (character.name) summary.push(character.name);
          if (character.current_status)
            summary.push(`상태: ${character.current_status}`);
          if (character.personality)
            summary.push(`성격: ${character.personality}`);
          if (character.current_location)
            summary.push(`위치: ${character.current_location}`);
          characterLines.push(`- ${summary.join(' | ')}`);
        });
      if (this.context.references.characters.length > maxItems) {
        characterLines.push(
          `- ... (${this.context.references.characters.length - maxItems}명 추가)`,
        );
      }
    }

    if (this.context.references.places.length === 0) {
      placeLines.push('- (등록된 장소 없음 → 새 배경을 창작해야 합니다)');
    } else {
      this.context.references.places.slice(0, maxItems).forEach((place) => {
        const summary: string[] = [];
        if (place.name) summary.push(place.name);
        if (place.current_situation)
          summary.push(`상황: ${place.current_situation}`);
        placeLines.push(`- ${summary.join(' | ')}`);
      });
      if (this.context.references.places.length > maxItems) {
        placeLines.push(
          `- ... (${this.context.references.places.length - maxItems}곳 추가)`,
        );
      }
    }

    return { characters: characterLines, places: placeLines };
  }

  private buildReferenceSections(): string[] {
    const sections: string[] = [];
    const summaries = this.summarizeReferences();

    sections.push('## 기존 등장인물');
    sections.push(...summaries.characters);
    sections.push('');
    sections.push('## 기존 장소');
    sections.push(...summaries.places);

    return sections;
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

  private updateCharacterReference(data: Record<string, unknown>) {
    const references = this.context.references.characters;
    const index = references.findIndex(
      (item) =>
        (typeof data.id === 'string' && item.id === data.id) ||
        (typeof data.name === 'string' &&
          item.name === data.name.trim() &&
          item.name.length > 0),
    );
    const current = index >= 0 ? references[index] : undefined;
    const normalized = this.mergeCharacterReference(data, current);
    if (!normalized) {
      return;
    }

    if (index >= 0) {
      references[index] = normalized;
    } else {
      references.push(normalized);
    }
  }

  private updatePlaceReference(data: Record<string, unknown>) {
    const references = this.context.references.places;
    const index = references.findIndex(
      (item) =>
        (typeof data.id === 'string' && item.id === data.id) ||
        (typeof data.name === 'string' &&
          item.name === data.name.trim() &&
          item.name.length > 0),
    );
    const current = index >= 0 ? references[index] : undefined;
    const normalized = this.mergePlaceReference(data, current);
    if (!normalized) {
      return;
    }

    if (index >= 0) {
      references[index] = normalized;
    } else {
      references.push(normalized);
    }
  }

  private recordToolSideEffects(
    toolName: string,
    args: unknown,
    rawResult: string,
  ) {
    const canonicalName = toolName.replace(/_/g, '.');
    if (
      canonicalName !== 'characters.create' &&
      canonicalName !== 'characters.update' &&
      canonicalName !== 'places.create' &&
      canonicalName !== 'places.update'
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

    if (
      canonicalName === 'characters.create' ||
      canonicalName === 'characters.update'
    ) {
      this.upsertCharacter(merged);
      this.updateCharacterReference(merged);
    } else if (canonicalName === 'places.create') {
      this.upsertPlace(merged);
      this.updatePlaceReference(merged);
    } else if (canonicalName === 'places.update') {
      this.upsertPlace(merged);
      this.updatePlaceReference(merged);
    }
  }

  private async loadReferenceData(forceReload = false): Promise<void> {
    const needsCharacters =
      forceReload || this.context.references.characters.length === 0;
    const needsPlaces =
      forceReload || this.context.references.places.length === 0;
    if (!needsCharacters && !needsPlaces) {
      return;
    }

    try {
      const [charactersRaw, placesRaw] = await Promise.all([
        executeMcpTool('characters_list', { limit: 100 }),
        executeMcpTool('places_list', { limit: 100 }),
      ]);
      const parsedCharacters = this.tryParseJson(charactersRaw);
      const parsedPlaces = this.tryParseJson(placesRaw);

      if (needsCharacters) {
        const characters = Array.isArray(parsedCharacters)
          ? parsedCharacters
              .map((item) =>
                this.isRecord(item)
                  ? this.mergeCharacterReference(item)
                  : null,
              )
              .filter(
                (item): item is EscapeFromSeoulCharacters => item !== null,
              )
          : [];
        this.context.references.characters = characters;
      }

      if (needsPlaces) {
        const places = Array.isArray(parsedPlaces)
          ? parsedPlaces
              .map((item) =>
                this.isRecord(item)
                  ? this.mergePlaceReference(item)
                  : null,
              )
              .filter((item): item is EscapeFromSeoulPlaces => item !== null)
          : [];
        this.context.references.places = places;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown reference load error';
      this.debug(`Failed to load reference data: ${message}`);
    }
  }

  async reconcileEntities(): Promise<void> {
    await this.loadReferenceData(true);
    const systemPrompt =
      '당신은 "서울 좀비 일지" 프로젝트의 데이터 정합성을 책임지는 기록 보조원입니다. 주 임무는 스토리에서 등장한 캐릭터와 장소가 Supabase DB에 모두 반영되도록 MCP 도구를 호출하는 것입니다.';
    const summaries = this.summarizeReferences();

    const prompt = [
      '# Entity Reconciliation',
      '',
      '## 기존 등장인물',
      ...summaries.characters,
      '',
      '## 기존 장소',
      ...summaries.places,
      '',
      '## 최신 본문',
      this.context.draft.content || '(본문 없음)',
      '',
      '## 지침',
      '- 본문에서 새롭게 등장한 캐릭터나 장소가 기존 목록에 없으면 `characters.create` 또는 `places.create`를 호출해 기본 정보를 저장하세요.',
      '- 기존 인물/장소의 속성이 본문 내용으로 갱신되어야 한다면 `characters.update` 또는 `places.update`로 최신 정보를 반영하세요.',
      '- 모든 도구 호출 후에는 응답을 확인하고 오류가 있으면 수정해 다시 시도하세요.',
      '- 추가 조치가 필요 없다면 도구를 호출하지 말고 \"OK\"라고만 답하세요.',
    ].join('\n');

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    await this.chatWithTools(messages);
    await this.loadReferenceData(true);
  }

  // Phase 1: Prewriting (구상)
  async executePrewriting(): Promise<PhaseResult> {
    await this.loadReferenceData(true);
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
    await this.loadReferenceData(true);
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
    await this.loadReferenceData(true);
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
    parts.push(
      '   - baseDate/baseTime은 HHmm 형식이며 10분 단위 값만 허용됩니다(예: 0130). 제공하지 않으면 자동 계산되며, 재시도 시에는 동일한 값으로 호출하세요.',
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
