import { z } from 'zod';

import type { LLMAdapter } from '../lib/llm';
import {
  loadReviewerPromptTemplate,
  loadReviewerSystemPrompt,
} from '../lib/prompts';
import type {
  CharacterRow,
  EpisodeRow,
  LocationRow,
  NovelRow,
} from '../repositories/novelRepository';

const ReviewerSchema = z
  .object({
    approved: z.boolean().describe('초안 승인 여부'),
    feedback: z.string().optional().describe('수정이 필요한 경우 피드백'),
    plotSeedsResolved: z.boolean().optional().describe('모든 플롯 시드가 회수되었는지'),
    newCharacters: z
      .array(
        z.object({
          name: z.string().min(1).describe('새로운 캐릭터 이름'),
          traits: z.string().optional().describe('캐릭터 특성'),
          personality: z.string().optional().describe('캐릭터 성격'),
          description: z.string().optional().describe('캐릭터 외모/설명'),
        })
      )
      .default([])
      .describe('초안에 등장하지만 "기존 캐릭터" 목록에 없는 새로운 인물들. 승인 시 이 목록을 사용하여 저장합니다.'),
    newLocations: z
      .array(
        z.object({
          name: z.string().min(1).describe('새로운 장소 이름'),
          description: z.string().optional().describe('장소 설명'),
        })
      )
      .default([])
      .describe('초안에 등장하지만 "기존 장소" 목록에 없는 새로운 장소들. 승인 시 이 목록을 사용하여 저장합니다.'),
  })
  .superRefine((value, context) => {
    if (!value.approved && (!value.feedback || value.feedback.trim().length === 0)) {
      context.addIssue({
        code: 'custom',
        message: 'Feedback is required when not approved.',
      });
    }
  });

export type ReviewerResult = z.infer<typeof ReviewerSchema>;

type ReviewerInput = {
  novel: NovelRow;
  episodes: EpisodeRow[];
  draftBody: string;
  initialPlotSeeds?: string;
  existingCharacters: CharacterRow[];
  existingLocations: LocationRow[];
};

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;

  return `${text.slice(0, limit)}...`;
}

function formatEpisodeContext(episodes: EpisodeRow[]): string {
  if (episodes.length === 0) return '(none)';

  return episodes
    .map((episode) => {
      const body = truncateText(episode.body, 1600);

      return `Episode ${episode.episode_number}: ${body}`;
    })
    .join('\n\n');
}

function formatCharacterList(characters: CharacterRow[]): string {
  if (characters.length === 0) return '(없음)';

  return characters
    .map((c) => {
      const parts = [c.name];
      if (c.traits) parts.push(`특성: ${c.traits}`);
      if (c.personality) parts.push(`성격: ${c.personality}`);

      return `- ${parts.join(', ')}`;
    })
    .join('\n');
}

function formatLocationList(locations: LocationRow[]): string {
  if (locations.length === 0) return '(없음)';

  return locations
    .map((l) => {
      if (l.description) return `- ${l.name}: ${l.description}`;

      return `- ${l.name}`;
    })
    .join('\n');
}

export class ReviewerAgent {
  constructor(
    private readonly adapter: LLMAdapter,
    private readonly model: string
  ) {}

  async review(input: ReviewerInput): Promise<ReviewerResult> {
    const systemInstruction = loadReviewerSystemPrompt();

    const promptTemplate = loadReviewerPromptTemplate();
    const prompt = promptTemplate
      .replace('${title}', input.novel.title)
      .replace('${storyBible}', input.novel.story_bible)
      .replace('${initialPlotSeeds}', input.initialPlotSeeds ?? '(none)')
      .replace('${previousEpisodes}', formatEpisodeContext(input.episodes))
      .replace('${draftBody}', input.draftBody)
      .replace('${existingCharacters}', formatCharacterList(input.existingCharacters))
      .replace('${existingLocations}', formatLocationList(input.existingLocations));

    return this.adapter.generateJson({
      model: this.model,
      systemInstruction,
      prompt,
      schema: ReviewerSchema,
      temperature: 0.3,
      maxOutputTokens: 8192,
    });
  }
}
