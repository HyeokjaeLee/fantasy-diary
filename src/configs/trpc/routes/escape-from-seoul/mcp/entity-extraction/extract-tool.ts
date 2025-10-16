import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

import { IS_DEV } from '@/constants';
import { ENV } from '@/env';
import { GeminiModel } from '@/types/gemini';

import {
  entityExtractionInputSchema,
  type EntityExtractionOutput,
  entityExtractionOutputSchema,
} from './schemas';

const EXTRACTION_PROMPT = `
당신은 소설 콘텐츠에서 엔티티를 추출하는 전문가입니다.
주어진 콘텐츠를 분석하여 등장하는 캐릭터와 장소를 추출하세요.

## 작업
1. 콘텐츠에서 실제로 등장하거나 언급된 캐릭터 추출
   - name: 캐릭터 이름
   - role: 캐릭터의 역할 (선택)
   - action: 콘텐츠에서 수행한 주요 행동 (선택)

2. 콘텐츠에서 실제로 등장하거나 언급된 장소 추출
   - name: 장소 이름
   - description: 장소에 대한 설명 (선택)

## 응답 형식 (JSON)
\`\`\`json
{
  "characters": [
    {
      "name": "캐릭터명",
      "role": "역할 (선택)",
      "action": "행동 (선택)"
    }
  ],
  "places": [
    {
      "name": "장소명",
      "description": "설명 (선택)"
    }
  ]
}
\`\`\`

**중요**: 반드시 위 JSON 형식으로만 응답하세요.
`.trim();

const RETRY_PROMPT_LEVEL_1 = `
JSON 형식이 올바르지 않습니다. 다시 시도하세요.
반드시 다음 형식을 따라주세요:

\`\`\`json
{
  "characters": [...],
  "places": [...]
}
\`\`\`
`.trim();

const RETRY_PROMPT_LEVEL_2 = `
JSON 형식이 여전히 올바르지 않습니다.
다음 예시를 참고하여 정확히 같은 구조로 응답하세요:

\`\`\`json
{
  "characters": [
    {
      "name": "김지훈",
      "role": "생존자",
      "action": "식량을 찾아 이동했다"
    }
  ],
  "places": [
    {
      "name": "서울역",
      "description": "혼잡한 지하철역"
    }
  ]
}
\`\`\`

**반드시 위와 같은 형식으로만 응답하세요.**
`.trim();

const MAX_RETRIES = 3;

/**
 * Extract entities from content with retry logic
 */
export async function extractEntitiesFromContent(
  content: string,
): Promise<EntityExtractionOutput> {
  // Validate input
  const inputValidation = entityExtractionInputSchema.safeParse({ content });
  if (!inputValidation.success) {
    throw new Error(
      `Invalid input: ${inputValidation.error.issues.map((e) => e.message).join(', ')}`,
    );
  }

  const client = new GoogleGenAI({
    apiKey: ENV.NEXT_GOOGLE_GEMINI_API_KEY,
  });

  let attempt = 0;
  let lastError: string | null = null;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      const prompt = buildPrompt(content, attempt, lastError);

      if (IS_DEV) {
        console.info(
          `[Entity Extraction] Attempt ${attempt}/${MAX_RETRIES} - Extracting entities`,
        );
      }

      const response = await client.models.generateContent({
        model: IS_DEV ? GeminiModel.FLASH_LITE : GeminiModel.PRO,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: EXTRACTION_PROMPT,
        },
      });

      const text = response.text ?? '';
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : text;

      // Parse and validate
      const parsed = JSON.parse(jsonString);
      const validation = entityExtractionOutputSchema.safeParse(parsed);

      if (!validation.success) {
        const errorMessages = validation.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        lastError = errorMessages;

        if (IS_DEV) {
          console.warn(
            `[Entity Extraction] Validation failed (attempt ${attempt}):`,
            errorMessages,
          );
        }

        // Retry if not last attempt
        if (attempt < MAX_RETRIES) {
          continue;
        }

        throw new Error(`Validation failed after ${MAX_RETRIES} attempts`);
      }

      if (IS_DEV) {
        console.info(
          `[Entity Extraction] Success on attempt ${attempt}:`,
          `${validation.data.characters.length} characters, ${validation.data.places.length} places`,
        );
      }

      return validation.data;
    } catch (error) {
      if (error instanceof z.ZodError) {
        lastError = error.issues.map((e) => e.message).join(', ');
      } else if (error instanceof Error) {
        lastError = error.message;
      } else {
        lastError = 'Unknown error';
      }

      if (IS_DEV) {
        console.error(
          `[Entity Extraction] Error on attempt ${attempt}:`,
          lastError,
        );
      }

      // Throw error if last attempt
      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `Entity extraction failed after ${MAX_RETRIES} attempts: ${lastError}`,
        );
      }
    }
  }

  throw new Error('Entity extraction failed: Max retries exceeded');
}

/**
 * Build prompt based on attempt number
 */
function buildPrompt(
  content: string,
  attempt: number,
  lastError: string | null,
): string {
  let prompt = `다음 콘텐츠를 분석하여 등장하는 캐릭터와 장소를 추출하세요:\n\n${content}`;

  if (attempt === 2 && lastError) {
    prompt += `\n\n${RETRY_PROMPT_LEVEL_1}\n\n이전 시도에서 발생한 오류: ${lastError}`;
  } else if (attempt === 3 && lastError) {
    prompt += `\n\n${RETRY_PROMPT_LEVEL_2}\n\n이전 시도에서 발생한 오류: ${lastError}`;
  }

  return prompt;
}
