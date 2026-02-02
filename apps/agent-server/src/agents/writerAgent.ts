import { z } from "zod";

import { generateJson } from "../lib/genai";
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
    const systemInstruction = [
      "You are a fiction writer generating the next episode of a serialized novel.",
      "Return only JSON that matches the given schema.",
      "Do not include markdown, code fences, or commentary.",
      "Use double quotes for all JSON keys and string values.",
      "The body must be between 500 and 700 characters.",
      "Follow the story bible and append prompt for tone and rules.",
      "Maintain smooth flow and consistent style with prior episodes.",
      "Avoid repetitive expressions or redundant phrasing in the episode.",
      "Keep the JSON concise and do not add any extra fields.",
      "If new characters or locations appear, include them in the structured fields.",
    ].join("\n");

    const prompt = [
      `Novel title: ${input.novel.title}`,
      `Genre: ${input.novel.genre}`,
      `Episode number to write: ${input.episodeNumber}`,
      "Story bible:",
      input.novel.story_bible,
      input.novel.append_prompt ? "Append prompt:" : "Append prompt: (none)",
      input.novel.append_prompt ?? "",
      "\nExisting characters:",
      formatCharacters(input.characters),
      "\nExisting locations:",
      formatLocations(input.locations),
      "\nRecent episodes:",
      formatEpisodeContext(input.episodes),
      input.feedback ? "\nReviewer feedback:" : "",
      input.feedback ?? "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");

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
