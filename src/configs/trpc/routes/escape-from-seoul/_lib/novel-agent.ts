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

import SYSTEM_PROMPT from '../_prompt/system-prompt.md';
import type { ChapterContext, PhaseResult } from '../_types/novel';
import { extractEntitiesFromContent } from '../mcp/entity-extraction';
import { executeMcpToolViaTrpc } from './mcp-client';

const RECONCILIATION_PROMPT = `
당신은 "Escape from Seoul" 프로젝트의 데이터 정리 담당자입니다.
작성된 콘텐츠를 분석하여 DB 저장에 필요한 정보를 정확히 추출하세요.
`.trim();

const ENRICH_CHARACTER_PROMPT = `
당신은 소설의 캐릭터를 분석하는 전문가입니다.
추출된 캐릭터의 기본 정보를 바탕으로, 콘텐츠에서 드러나는 세부 정보를 추출하고 정형화하세요.

## 작업
주어진 캐릭터에 대해 다음 필드를 채워주세요:
- personality: 캐릭터의 성격 특성 (100자 이내)
- background: 캐릭터의 배경 정보 (150자 이내)
- appearance: 캐릭터의 외형 묘사 (100자 이내)
- current_place: 현재 위치 또는 상황 (50자 이내)
- character_traits: 주요 특징 (배열, 최대 5개)
- current_status: 현재 상태 (50자 이내)

## 응답 형식 (JSON)
\`\`\`json
{
  "personality": "성격 설명",
  "background": "배경 정보",
  "appearance": "외형 묘사",
  "current_place": "현재 위치",
  "character_traits": ["특징1", "특징2"],
  "current_status": "현재 상태"
}
\`\`\`

**중요**: 필드가 없거나 불분명하면 빈 문자열이나 빈 배열을 사용하세요.
`.trim();

const ENRICH_PLACE_PROMPT = `
당신은 소설의 배경 장소를 분석하는 전문가입니다.
추출된 장소의 기본 정보를 바탕으로, 콘텐츠에서 드러나는 세부 정보를 추출하고 정형화하세요.

## 작업
주어진 장소에 대해 다음 필드를 채워주세요:
- current_situation: 현재 상황 또는 특징 (150자 이내)
- latitude: 위도 (예: 37.5)
- longitude: 경도 (예: 126.9)

**참고**: 장소가 서울의 실제 위치라면, 정확한 좌표를 사용하세요.
없거나 불분명하면 기본값(latitude: 0, longitude: 0)을 사용하세요.

## 응답 형식 (JSON)
\`\`\`json
{
  "current_situation": "장소 상황 설명",
  "latitude": 37.5,
  "longitude": 126.9
}
\`\`\`

**중요**: 숫자 필드는 반드시 숫자 타입으로, 문자 필드는 문자열로 작성하세요.
`.trim();

type AgentMessage = {
  role: 'system' | 'user';
  content: string;
};

export class NovelWritingAgent {
  private client: GoogleGenAI;
  private context: ChapterContext;
  private allTools: FunctionDeclaration[];
  private readOnlyTools: FunctionDeclaration[];

  constructor(
    context: ChapterContext,
    functionDeclarations: FunctionDeclaration[],
  ) {
    this.client = new GoogleGenAI({
      apiKey: ENV.NEXT_GOOGLE_GEMINI_API_KEY,
    });
    this.context = context;
    this.allTools = functionDeclarations;

    // read 도구만 필터링 (write 도구 제외)
    this.readOnlyTools = functionDeclarations.filter(
      (tool) =>
        !tool.name?.includes('.create') &&
        !tool.name?.includes('.update') &&
        !tool.name?.includes('.delete'),
    );
  }

  private debug(message: string) {
    console.info(`[${this.context.id ?? 'unknown'}] ${message}`);
  }

  private logContextChange(phase: string, changes: Partial<ChapterContext>) {
    if (!IS_DEV) return;

    const { content, ...restChanges } = changes;
    const contentInfo =
      content !== undefined ? { contentLength: content.length } : {};

    console.info(
      `[${this.context.id ?? 'unknown'}] 📝 Context updated in ${phase}:`,
      {
        ...restChanges,
        ...contentInfo,
      },
    );
  }

  // References 업데이트 헬퍼
  private async updateCharacterReferences(characterNames: string[]) {
    for (const name of characterNames) {
      // 이미 new 또는 updated에 있는지 확인
      if (
        this.context.characters.new.some((c) => c.name === name) ||
        this.context.characters.updated.some((c) => c.name === name)
      ) {
        continue;
      }

      // DB에서 캐릭터 조회
      try {
        const result = await executeMcpToolViaTrpc('characters_list', { name });
        const parsed = JSON.parse(result);
        const characters = Array.isArray(parsed) ? parsed : [];

        if (characters.length > 0) {
          const dbCharacter = characters[0] as {
            name: string;
            personality?: string;
            background?: string;
            appearance?: string;
            current_place?: string;
            relationships?: unknown;
            major_events?: string[];
            character_traits?: string[];
            current_status?: string;
            last_mentioned_episode_id?: string;
          };
          this.context.characters.updated.push({
            name: dbCharacter.name,
            personality: dbCharacter.personality ?? '',
            background: dbCharacter.background ?? '',
            appearance: dbCharacter.appearance ?? '',
            current_place: dbCharacter.current_place ?? '',
            relationships: dbCharacter.relationships ?? {},
            major_events: dbCharacter.major_events ?? [],
            character_traits: dbCharacter.character_traits ?? [],
            current_status: dbCharacter.current_status ?? '',
            last_mentioned_episode_id:
              dbCharacter.last_mentioned_episode_id ?? '',
            updated_at: new Date().toISOString(),
          });
          if (IS_DEV) {
            console.info(
              `[${this.context.id ?? 'unknown'}] 👤 Added character to updated: ${name}`,
            );
          }
        }
      } catch (error) {
        this.debug(
          `Failed to fetch character ${name}: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }
  }

  private async updatePlaceReferences(placeNames: string[]) {
    for (const name of placeNames) {
      // 이미 new 또는 updated에 있는지 확인
      if (
        this.context.places.new.some((p) => p.name === name) ||
        this.context.places.updated.some((p) => p.name === name)
      ) {
        continue;
      }

      // DB에서 장소 조회
      try {
        const result = await executeMcpToolViaTrpc('places_list', { name });
        const parsed = JSON.parse(result);
        const places = Array.isArray(parsed) ? parsed : [];

        if (places.length > 0) {
          const dbPlace = places[0] as {
            name: string;
            current_situation?: string;
            latitude?: number;
            longitude?: number;
            last_weather_condition?: string;
            last_weather_weather_condition?: string;
            last_mentioned_episode_id?: string;
          };
          this.context.places.updated.push({
            name: dbPlace.name,
            current_situation: dbPlace.current_situation ?? '',
            latitude: dbPlace.latitude ?? 0,
            longitude: dbPlace.longitude ?? 0,
            last_weather_condition: dbPlace.last_weather_condition ?? '',
            last_weather_weather_condition:
              dbPlace.last_weather_weather_condition ?? '',
            last_mentioned_episode_id: dbPlace.last_mentioned_episode_id ?? '',
            updated_at: new Date().toISOString(),
          });
          if (IS_DEV) {
            console.info(
              `[${this.context.id ?? 'unknown'}] 📍 Added place to updated: ${name}`,
            );
          }
        }
      } catch (error) {
        this.debug(
          `Failed to fetch place ${name}: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }
  }

  // Enrich new characters with detailed information from content
  private async enrichNewCharacters(
    newCharacters: Array<{ name: string; role?: string; action?: string }>,
    content: string,
  ): Promise<void> {
    if (newCharacters.length === 0) return;

    for (const character of newCharacters) {
      try {
        const prompt = `
## 콘텐츠
${content}

## 캐릭터 정보
- name: ${character.name}
- role (초기): ${character.role || '(없음)'}
- action (초기): ${character.action || '(없음)'}

위 콘텐츠와 캐릭터 정보를 바탕으로 캐릭터의 세부 정보를 추출하세요.
`;

        if (IS_DEV) {
          console.info(
            `[${this.context.id ?? 'unknown'}] 🔧 Enriching new character: ${character.name}`,
          );
        }

        const response = await this.client.models.generateContent({
          model: IS_DEV ? GeminiModel.FLASH_LITE : GeminiModel.PRO,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction: ENRICH_CHARACTER_PROMPT,
          },
        });

        const text = response.text ?? '';
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : text;
        const enrichedData = JSON.parse(jsonString);

        const newCharacterData = {
          name: character.name,
          personality: enrichedData.personality ?? '',
          background: enrichedData.background ?? '',
          appearance: enrichedData.appearance ?? '',
          current_place: enrichedData.current_place ?? '',
          relationships: {},
          major_events: [],
          character_traits: Array.isArray(enrichedData.character_traits)
            ? enrichedData.character_traits
            : [],
          current_status: enrichedData.current_status ?? '',
          last_mentioned_episode_id: this.context.id ?? '',
          updated_at: new Date().toISOString(),
        };

        this.context.characters.new.push(newCharacterData);

        if (IS_DEV) {
          console.info(
            `[${this.context.id ?? 'unknown'}] ✅ New character enriched: ${character.name}`,
          );
        }
      } catch (error) {
        this.debug(
          `Failed to enrich character ${character.name}: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }
  }

  // Enrich new places with detailed information from content
  private async enrichNewPlaces(
    newPlaces: Array<{ name: string; description?: string }>,
    content: string,
  ): Promise<void> {
    if (newPlaces.length === 0) return;

    for (const place of newPlaces) {
      try {
        const prompt = `
## 콘텐츠
${content}

## 장소 정보
- name: ${place.name}
- description (초기): ${place.description || '(없음)'}

위 콘텐츠와 장소 정보를 바탕으로 장소의 세부 정보를 추출하세요.
`;

        if (IS_DEV) {
          console.info(
            `[${this.context.id ?? 'unknown'}] 🔧 Enriching new place: ${place.name}`,
          );
        }

        const response = await this.client.models.generateContent({
          model: IS_DEV ? GeminiModel.FLASH_LITE : GeminiModel.PRO,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction: ENRICH_PLACE_PROMPT,
          },
        });

        const text = response.text ?? '';
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : text;
        const enrichedData = JSON.parse(jsonString);

        const newPlaceData = {
          name: place.name,
          current_situation: enrichedData.current_situation ?? '',
          latitude:
            typeof enrichedData.latitude === 'number'
              ? enrichedData.latitude
              : 0,
          longitude:
            typeof enrichedData.longitude === 'number'
              ? enrichedData.longitude
              : 0,
          last_weather_condition: '',
          last_weather_weather_condition: '',
          last_mentioned_episode_id: this.context.id ?? '',
          updated_at: new Date().toISOString(),
        };

        this.context.places.new.push(newPlaceData);

        if (IS_DEV) {
          console.info(
            `[${this.context.id ?? 'unknown'}] ✅ New place enriched: ${place.name}`,
          );
        }
      } catch (error) {
        this.debug(
          `Failed to enrich place ${place.name}: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }
  }

  // Extract entities from content and update context
  private async extractAndUpdateEntitiesFromContent(content: string) {
    try {
      if (IS_DEV) {
        console.info(
          `[${this.context.id ?? 'unknown'}] 🔍 Starting entity extraction from content`,
        );
      }

      const entities = await extractEntitiesFromContent(content);

      // Extract character names
      const characterNames = entities.characters.map((c) => c.name);
      if (characterNames.length > 0) {
        await this.updateCharacterReferences(characterNames);
      }

      // Extract place names
      const placeNames = entities.places.map((p) => p.name);
      if (placeNames.length > 0) {
        await this.updatePlaceReferences(placeNames);
      }

      // Identify new characters (not in DB or context)
      const newCharacters = entities.characters.filter((character) => {
        const existsInContext =
          this.context.characters.new.some((c) => c.name === character.name) ||
          this.context.characters.updated.some(
            (c) => c.name === character.name,
          );

        return !existsInContext;
      });

      // Identify new places (not in DB or context)
      const newPlaces = entities.places.filter((place) => {
        const existsInContext =
          this.context.places.new.some((p) => p.name === place.name) ||
          this.context.places.updated.some((p) => p.name === place.name);

        return !existsInContext;
      });

      // Enrich new entities with detailed information
      if (newCharacters.length > 0) {
        await this.enrichNewCharacters(newCharacters, content);
      }

      if (newPlaces.length > 0) {
        await this.enrichNewPlaces(newPlaces, content);
      }

      if (IS_DEV) {
        console.info(
          `[${this.context.id ?? 'unknown'}] ✅ Entity extraction completed:`,
          {
            charactersExtracted: characterNames.length,
            placesExtracted: placeNames.length,
            newCharactersEnriched: newCharacters.length,
            newPlacesEnriched: newPlaces.length,
          },
        );
      }
    } catch (error) {
      this.debug(
        `Entity extraction failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      // Don't throw - just log the error and continue
    }
  }

  // Phase 0: Planning - 이전 에피소드 분석 및 previousStory 생성
  async executePlanning(): Promise<PhaseResult> {
    const prompt = `
# Planning Phase

이전 에피소드들을 분석하여 스토리 맥락을 파악하세요.

## 작업
1. episodes.list 도구로 최근 5개 에피소드 조회
2. characters.list, places.list로 기존 캐릭터와 장소 목록 조회
3. 이전 에피소드들의 주요 내용, 등장인물, 장소, 진행 상황을 요약하여 previousStory 작성
4. 응답 형식:
\`\`\`json
{
  "previousStory": "지금까지의 이야기 요약 (300-500자)",
  "keyCharacters": ["캐릭터1", "캐릭터2", ...],
  "keyPlaces": ["장소1", "장소2", ...]
}
\`\`\`
`;

    const messages: AgentMessage[] = [
      {
        role: 'system',
        content:
          '당신은 스토리 분석가입니다. 이전 에피소드를 분석하고 맥락을 정리하세요.',
      },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages, this.readOnlyTools);

    try {
      const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : output;
      const result = JSON.parse(jsonString);

      this.context.previousStory = result.previousStory || '';

      // keyCharacters/keyPlaces로 references 조회 및 업데이트
      if (result.keyCharacters?.length > 0) {
        await this.updateCharacterReferences(result.keyCharacters);
      }
      if (result.keyPlaces?.length > 0) {
        await this.updatePlaceReferences(result.keyPlaces);
      }

      this.logContextChange('planning', {
        previousStory: this.context.previousStory,
        characters: this.context.characters,
        places: this.context.places,
      });
    } catch (error) {
      this.debug(
        `Failed to parse planning result: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      this.context.previousStory = '';
      this.logContextChange('planning', { previousStory: '' });
    }

    return {
      success: true,
      phase: 'planning',
      output,
      context: this.context,
    };
  }

  // Phase 1: Prewriting - 구상
  async executePrewriting(): Promise<PhaseResult> {
    const allCharacters = [
      ...this.context.characters.new,
      ...this.context.characters.updated,
    ];
    const allPlaces = [
      ...this.context.places.new,
      ...this.context.places.updated,
    ];

    const characterInfo =
      allCharacters
        .map(
          (c) =>
            `- ${c.name}: ${c.personality || ''} (현재: ${c.current_place || ''})`,
        )
        .join('\n') || '(없음)';

    const placeInfo =
      allPlaces
        .map((p) => `- ${p.name}: ${p.current_situation || ''}`)
        .join('\n') || '(없음)';

    const prompt = `
# Prewriting Phase

## 지금까지의 이야기
${this.context.previousStory || '(첫 에피소드)'}

## 기존 캐릭터
${characterInfo}

## 기존 장소
${placeInfo}

## 작업
다음 챕터의 전개 방향을 구상하세요:

1. **새로운 장소나 캐릭터를 언급할 경우**:
   - 기존 캐릭터/장소 목록을 먼저 확인
   - 새로운 장소라면 google.places.describe와 weather.openMeteo.lookup으로 실제 정보 조회
   - 조회한 정보를 바탕으로 생생하게 묘사
   
2. **구상 내용**:
   - 주요 사건과 갈등
   - 등장 캐릭터와 역할
   - 배경 장소와 분위기
   - 감정적 흐름

3. **응답 형식** (JSON으로 답변):
\`\`\`json
{
  "outline": "전개 방향 요약",
  "mentionedCharacters": ["언급할 캐릭터 이름들"],
  "mentionedPlaces": ["언급할 장소 이름들"]
}
\`\`\`
`;

    const content = `${SYSTEM_PROMPT}

# 구상 단계 안내
이 단계에서는 다음 챕터의 전개를 자유롭게 구상합니다.
필요시 characters.list, places.list, google.places.describe, weather.openMeteo.lookup 등 조회 도구를 사용할 수 있습니다.`;

    const messages: AgentMessage[] = [
      { role: 'system', content },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages, this.readOnlyTools);

    // 구상 단계에서 언급된 캐릭터/장소 references 업데이트
    try {
      const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : output;
      const result = JSON.parse(jsonString);

      if (result.mentionedCharacters?.length > 0) {
        await this.updateCharacterReferences(result.mentionedCharacters);
      }
      if (result.mentionedPlaces?.length > 0) {
        await this.updatePlaceReferences(result.mentionedPlaces);
      }

      this.logContextChange('prewriting', {
        characters: this.context.characters,
        places: this.context.places,
      });
    } catch (error) {
      this.debug(
        `Failed to parse prewriting result: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    return {
      success: true,
      phase: 'prewriting',
      output,
      context: this.context,
    };
  }

  // Phase 2: Drafting - 초고 작성
  async executeDrafting(): Promise<PhaseResult> {
    const allCharacters = [
      ...this.context.characters.new,
      ...this.context.characters.updated,
    ];
    const allPlaces = [
      ...this.context.places.new,
      ...this.context.places.updated,
    ];

    const characterInfo =
      allCharacters
        .map(
          (c) =>
            `- ${c.name}: ${c.personality || ''}, ${c.appearance || ''} (위치: ${c.current_place || '알 수 없음'})`,
        )
        .join('\n') || '(없음)';

    const placeInfo =
      allPlaces
        .map(
          (p) =>
            `- ${p.name}: ${p.current_situation || ''} (좌표: ${p.latitude}, ${p.longitude})`,
        )
        .join('\n') || '(없음)';

    const prompt = `
# Drafting Phase

## 지금까지의 이야기
${this.context.previousStory || '(첫 에피소드)'}

## Context에 있는 캐릭터 정보
${characterInfo}

## Context에 있는 장소 정보
${placeInfo}

## 작업
약 5000자 분량의 챕터를 작성하세요.

**중요**:
- Context에 있는 캐릭터/장소 정보를 **반드시** 활용하세요
- 새로운 장소를 언급할 경우 google.places.describe와 weather.openMeteo.lookup으로 실제 정보를 조회하고 반영하세요
- 실제 서울의 지리와 날씨를 감각적으로 묘사하세요
- 작성한 내용을 그대로 출력하세요 (JSON 형식 아님)
`;

    const systemPrompt = `${SYSTEM_PROMPT}

# 작성 단계 안내
이 단계에서는 실제 챕터를 작성합니다.
Context에 있는 캐릭터와 장소 정보를 적극 활용하세요.
필요시 조회 도구(google.places.describe, weather.openMeteo.lookup 등)를 사용할 수 있습니다.`;

    const messages: AgentMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages, this.readOnlyTools);

    this.context.content = output;
    this.logContextChange('drafting', { content: output });

    // Extract entities from drafting content
    await this.extractAndUpdateEntitiesFromContent(output);

    return {
      success: true,
      phase: 'drafting',
      output,
      context: this.context,
    };
  }

  // Phase 3: Revision - 퇴고
  async executeRevision(): Promise<PhaseResult> {
    const allCharacters = [
      ...this.context.characters.new,
      ...this.context.characters.updated,
    ];
    const allPlaces = [
      ...this.context.places.new,
      ...this.context.places.updated,
    ];

    const characterInfo =
      allCharacters.map((c) => `- ${c.name}`).join(', ') || '(없음)';

    const placeInfo =
      allPlaces.map((p) => `- ${p.name}`).join(', ') || '(없음)';

    const prompt = `
# Revision Phase

## 작성한 초고
${this.context.content}

## Context에 등장한 캐릭터
${characterInfo}

## Context에 등장한 장소
${placeInfo}

## 작업
초고를 검토하고 다음을 개선하세요:
- 문장의 리듬과 흐름
- 불필요한 반복 제거
- 감정 표현의 선명함
- 장면 전환의 자연스러움
- Context에 있는 캐릭터/장소 정보의 일관성 확인

**중요**: 
- 수정된 최종본을 그대로 출력하세요
- 초고에서 언급된 모든 캐릭터와 장소 이름을 추출하여 마지막에 JSON으로 추가:

\`\`\`json
{
  "mentionedCharacters": ["실제로 등장한 캐릭터 이름들"],
  "mentionedPlaces": ["실제로 등장한 장소 이름들"]
}
\`\`\`
`;

    const messages: AgentMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages, this.readOnlyTools);

    // JSON 부분 분리
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    let finalContent = output;

    if (jsonMatch) {
      // JSON 앞부분이 실제 content
      finalContent = output.substring(0, jsonMatch.index).trim();

      try {
        const result = JSON.parse(jsonMatch[1]);

        // 최종 revision에서 언급된 캐릭터/장소로 references 업데이트
        if (result.mentionedCharacters?.length > 0) {
          await this.updateCharacterReferences(result.mentionedCharacters);
        }
        if (result.mentionedPlaces?.length > 0) {
          await this.updatePlaceReferences(result.mentionedPlaces);
        }
      } catch (error) {
        this.debug(
          `Failed to parse revision metadata: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }

    this.context.content = finalContent;

    // summary 생성
    this.context.summary = finalContent.replace(/\s+/g, ' ').slice(0, 280);

    // Extract entities from revised content
    await this.extractAndUpdateEntitiesFromContent(finalContent);

    this.logContextChange('revision', {
      content: finalContent,
      summary: this.context.summary,
      characters: this.context.characters,
      places: this.context.places,
    });

    return {
      success: true,
      phase: 'revision',
      output: finalContent,
      context: this.context,
    };
  }

  // Phase 4: Finalize - DB 저장을 위한 데이터 정리
  async executeFinalize(): Promise<{
    episode: { id: string; content: string; summary: string };
    characters: Array<Record<string, unknown>>;
    places: Array<Record<string, unknown>>;
  }> {
    // Context의 updated 데이터를 Gemini에 전달
    const updatedCharacters =
      this.context.characters.updated
        .map((c) => `- ${c.name} (기존 데이터)`)
        .join('\n') || '(없음)';

    const updatedPlaces =
      this.context.places.updated
        .map((p) => `- ${p.name} (기존 데이터)`)
        .join('\n') || '(없음)';

    const prompt = `
# Finalize Phase

## 작성된 최종 콘텐츠
${this.context.content}

## Context에 등장한 캐릭터 (기존 DB 데이터)
${updatedCharacters}

## Context에 등장한 장소 (기존 DB 데이터)
${updatedPlaces}

## 작업
최종 콘텐츠를 분석하여 다음을 추출하세요:

1. **이미 Context에 있는 캐릭터/장소**: 변경된 정보만 포함 (위치 변경, 상태 변경 등)
2. **새로운 캐릭터/장소**: 모든 필드를 채워서 포함

응답 형식:
\`\`\`json
{
  "newCharacters": [
    {
      "name": "캐릭터명",
      "personality": "성격",
      "background": "배경",
      "appearance": "외형",
      "current_place": "현재 위치",
      "relationships": {},
      "major_events": [],
      "character_traits": [],
      "current_status": "현재 상태",
      "last_mentioned_episode_id": "${this.context.id}"
    }
  ],
  "updatedCharacters": [
    {
      "name": "기존 캐릭터명",
      "personality": "변경된 성격",
      "current_place": "변경된 위치",
      "current_status": "변경된 상태",
      "last_mentioned_episode_id": "${this.context.id}"
    }
  ],
  "newPlaces": [
    {
      "name": "장소명",
      "current_situation": "현재 상황",
      "latitude": 37.5,
      "longitude": 127.0,
      "last_mentioned_episode_id": "${this.context.id}"
    }
  ],
  "updatedPlaces": [
    {
      "name": "기존 장소명",
      "current_situation": "변경된 상황",
      "last_mentioned_episode_id": "${this.context.id}"
    }
  ]
}
\`\`\`
`;

    const messages: AgentMessage[] = [
      { role: 'system', content: RECONCILIATION_PROMPT },
      { role: 'user', content: prompt },
    ];

    const output = await this.chatWithTools(messages, this.readOnlyTools);

    try {
      const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : output;
      const result = JSON.parse(jsonString);

      // new/updated 구조로 context 업데이트
      if (result.newCharacters?.length > 0) {
        this.context.characters.new.push(
          ...result.newCharacters.map((c: Record<string, unknown>) => ({
            ...c,
            updated_at: new Date().toISOString(),
          })),
        );
      }
      if (result.updatedCharacters?.length > 0) {
        // updated 배열에서 이름으로 기존 데이터 찾아서 업데이트
        for (const updatedChar of result.updatedCharacters) {
          const index = this.context.characters.updated.findIndex(
            (c) => c.name === updatedChar.name,
          );
          if (index >= 0) {
            this.context.characters.updated[index] = {
              ...this.context.characters.updated[index],
              ...updatedChar,
              updated_at: new Date().toISOString(),
            };
          }
        }
      }

      if (result.newPlaces?.length > 0) {
        this.context.places.new.push(
          ...result.newPlaces.map((p: Record<string, unknown>) => ({
            ...p,
            updated_at: new Date().toISOString(),
          })),
        );
      }
      if (result.updatedPlaces?.length > 0) {
        // updated 배열에서 이름으로 기존 데이터 찾아서 업데이트
        for (const updatedPlace of result.updatedPlaces) {
          const index = this.context.places.updated.findIndex(
            (p: { name?: string }) => p.name === updatedPlace.name,
          );
          if (index >= 0) {
            this.context.places.updated[index] = {
              ...this.context.places.updated[index],
              ...updatedPlace,
              updated_at: new Date().toISOString(),
            };
          }
        }
      }

      if (IS_DEV) {
        console.info(`[${this.context.id ?? 'unknown'}] 📋 Finalize result:`, {
          newCharactersCount: result.newCharacters?.length || 0,
          updatedCharactersCount: result.updatedCharacters?.length || 0,
          newPlacesCount: result.newPlaces?.length || 0,
          updatedPlacesCount: result.updatedPlaces?.length || 0,
        });
      }

      // 최종 반환: new와 updated를 모두 포함
      return {
        episode: {
          id: this.context.id || '',
          content: this.context.content,
          summary: this.context.summary,
        },
        characters: [
          ...this.context.characters.new,
          ...this.context.characters.updated,
        ],
        places: [...this.context.places.new, ...this.context.places.updated],
      };
    } catch (error) {
      this.debug(
        `Failed to parse finalize result: ${error instanceof Error ? error.message : 'Unknown'}`,
      );

      return {
        episode: {
          id: this.context.id || '',
          content: this.context.content,
          summary: this.context.summary,
        },
        characters: [
          ...this.context.characters.new,
          ...this.context.characters.updated,
        ],
        places: [...this.context.places.new, ...this.context.places.updated],
      };
    }
  }

  // MCP 도구 스키마 정보 추출
  private buildToolSchemaPrompt(): string {
    const createTools = this.allTools
      .filter(
        (decl) =>
          decl.name &&
          (decl.name === 'characters_create' || decl.name === 'places_create'),
      )
      .map((decl) => {
        const schema = decl.parametersJsonSchema as
          | { required?: string[] }
          | undefined;

        return {
          name: decl.name!.replace(/_/g, '.'),
          description: decl.description ?? '',
          requiredFields: schema?.required ?? [],
        };
      });

    if (createTools.length === 0) return '';

    const sections = createTools.map((tool) => {
      const fields = tool.requiredFields.join(', ');

      return `## ${tool.name}
${tool.description}

필수 필드: ${fields}`;
    });

    return ['# 데이터 스키마 정보', '', ...sections].join('\n');
  }

  // Gemini API 호출 with Function Calling
  private async chatWithTools(
    messages: AgentMessage[],
    tools: FunctionDeclaration[],
  ): Promise<string> {
    const maxIterations = 20;
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

    const conversation: Content[] = [...initialConversation];
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.models.generateContent({
        model: IS_DEV ? GeminiModel.FLASH_LITE : GeminiModel.PRO,
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

        return finalText;
      }

      // 도구 호출 처리
      for (const call of functionCalls) {
        const toolName = call.name ?? 'unknown';
        const args = call.args ?? {};

        if (IS_DEV) {
          console.info(`[${this.context.id ?? 'unknown'}] 🔧 MCP Tool Call:`, {
            tool: toolName,
            args,
            reason: 'AI determined this tool is needed for the current task',
          });
        }

        this.debug(`Calling tool ${toolName}`);

        let responsePayload: Record<string, unknown>;
        try {
          const result = await executeMcpToolViaTrpc(toolName, args);
          responsePayload = this.normalizeToolResponse(result);

          if (IS_DEV) {
            console.info(
              `[${this.context.id ?? 'unknown'}] ✅ MCP Tool Success:`,
              {
                tool: toolName,
                resultLength: JSON.stringify(responsePayload).length,
              },
            );
          }
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : 'Unknown error';
          this.debug(`Tool ${toolName} error: ${messageText}`);
          responsePayload = { error: messageText };

          if (IS_DEV) {
            console.error(
              `[${this.context.id ?? 'unknown'}] ❌ MCP Tool Error:`,
              {
                tool: toolName,
                error: messageText,
              },
            );
          }
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

    throw new Error('Max iterations reached in chatWithTools');
  }

  private normalizeToolResponse(result: string): Record<string, unknown> {
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
}
