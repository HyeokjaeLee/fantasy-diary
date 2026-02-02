import { z } from "zod";

import { generateJson } from "../lib/genai";
import {
  loadWriterPromptTemplate,
  loadWriterSystemPrompt,
  loadInitialPlotSeeds,
} from "../lib/prompts";
import type {
  CharacterRow,
  EpisodeRow,
  LocationRow,
  NovelRow,
} from "../repositories/novelRepository";

const WriterSchema = z.object({
  body: z.string().min(500).max(700),
  newCharacters: z
    .array(
      z.object({
        name: z.string().min(1),
        traits: z.string().optional(),
        personality: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
  newLocations: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .optional(),
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
    private readonly client: import("@google/genai").GoogleGenAI,
    private readonly model: string
  ) {}

  async generate(input: WriterInput): Promise<WriterResult> {
    const systemInstruction = loadWriterSystemPrompt();

    let initialPlotSeedsSection = "";
    if (input.initialPlotSeeds) {
      initialPlotSeedsSection = loadInitialPlotSeeds().replace("${initialPlotSeeds}", input.initialPlotSeeds);
    }

    const promptTemplate = loadWriterPromptTemplate();
    const prompt = promptTemplate
      .replace("${title}", input.novel.title)
      .replace("${genre}", input.novel.genre)
      .replace("${episodeNumber}", String(input.episodeNumber))
      .replace("${storyBible}", input.novel.story_bible)
      .replace("${appendPrompt}", input.novel.append_prompt ?? "(없음)")
      .replace("${initialPlotSeeds}", initialPlotSeedsSection)
      .replace("${characters}", formatCharacters(input.characters))
      .replace("${locations}", formatLocations(input.locations))
      .replace("${recentEpisodes}", formatEpisodeContext(input.episodes))
      .replace("${feedback}", input.feedback ?? "");

    return generateJson(this.client, {
      model: this.model,
      systemInstruction,
      prompt,
      schema: WriterSchema,
      temperature: 0.7,
      maxOutputTokens: 2500,
    });
  }
}
