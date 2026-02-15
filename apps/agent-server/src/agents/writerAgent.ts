import { z } from 'zod';

import type { LLMAdapter } from '../lib/llm';
import {
  loadInitialPlotSeeds,
  loadWriterPromptTemplate,
  loadWriterSystemPrompt,
} from '../lib/prompts';
import type {
  CharacterRow,
  EpisodeRow,
  LocationRow,
  NovelRow,
} from '../repositories/novelRepository';

const WriterSchema = z.object({
  body: z.string().min(500).max(700).describe('소설 본문 (500~700자)'),
  newCharacters: z
    .array(
      z.object({
        name: z.string().min(1).describe('캐릭터 이름'),
        traits: z.string().optional().describe('캐릭터 특성'),
        personality: z.string().optional().describe('캐릭터 성격'),
        description: z.string().optional().describe('캐릭터 외모/설명'),
      })
    )
    .default([])
    .describe('이번 에피소드에서 처음 등장하는 새로운 캐릭터 목록. 기존 캐릭터 목록에 없는 인물이 등장하면 반드시 추가하십시오.'),
  newLocations: z
    .array(
      z.object({
        name: z.string().min(1).describe('장소 이름'),
        description: z.string().optional().describe('장소 설명'),
      })
    )
    .default([])
    .describe('이번 에피소드에서 처음 등장하는 새로운 장소 목록. 기존 장소 목록에 없는 장소가 등장하면 반드시 추가하십시오.'),
});

export type WriterResult = z.infer<typeof WriterSchema>;

type WriterInput = {
  novel: NovelRow;
  episodeNumber: number;
  episodes: EpisodeRow[];
  characters: CharacterRow[];
  locations: LocationRow[];
  feedback?: string;
  initialPlotSeeds?: string;
};

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;

  return `${text.slice(0, limit)}...`;
}

function formatEpisodeContext(episodes: EpisodeRow[]): string {
  if (episodes.length === 0) return "(none)";

  return episodes
    .map((episode) => {
      const body = truncateText(episode.body, 1200);

      return `Episode ${episode.episode_number}: ${body}`;
    })
    .join("\n\n");
}

function formatCharacters(characters: CharacterRow[]): string {
  if (characters.length === 0) return "(none)";

  return characters
    .map((character) => {
      const parts = [character.name, character.traits, character.personality]
        .filter(Boolean)
        .join(" | ");

      return parts.length > 0 ? parts : character.name;
    })
    .join("\n");
}

function formatLocations(locations: LocationRow[]): string {
  if (locations.length === 0) return "(none)";

  return locations.map((location) => location.name).join("\n");
}

export class WriterAgent {
  constructor(
    private readonly adapter: LLMAdapter,
    private readonly model: string
  ) {}

  async generate(input: WriterInput): Promise<WriterResult> {
    const systemInstruction = loadWriterSystemPrompt();

    let initialPlotSeedsSection = '';
    if (input.initialPlotSeeds) {
      initialPlotSeedsSection = loadInitialPlotSeeds().replace('${initialPlotSeeds}', input.initialPlotSeeds);
    }

    const promptTemplate = loadWriterPromptTemplate();
    const prompt = promptTemplate
      .replace('${title}', input.novel.title)
      .replace('${genre}', input.novel.genre)
      .replace('${episodeNumber}', String(input.episodeNumber))
      .replace('${storyBible}', input.novel.story_bible)
      .replace('${appendPrompt}', input.novel.append_prompt ?? '(없음)')
      .replace('${initialPlotSeeds}', initialPlotSeedsSection)
      .replace('${characters}', formatCharacters(input.characters))
      .replace('${locations}', formatLocations(input.locations))
      .replace('${recentEpisodes}', formatEpisodeContext(input.episodes))
      .replace('${feedback}', input.feedback ?? '');

    return this.adapter.generateJson({
      model: this.model,
      systemInstruction,
      prompt,
      schema: WriterSchema,
      temperature: 0.7,
      maxOutputTokens: 8192,
    });
  }
}
