import { z } from "zod";

import type { EpisodeRow, NovelRow } from "../repositories/novelRepository";
import { generateJson } from "../lib/genai";
import {
  loadReviewerPromptTemplate,
  loadReviewerSystemPrompt,
} from "../lib/prompts";

const ReviewerSchema = z
  .object({
    approved: z.boolean(),
    feedback: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (!value.approved && (!value.feedback || value.feedback.trim().length === 0)) {
      context.addIssue({
        code: "custom",
        message: "Feedback is required when not approved.",
      });
    }
  });

export type ReviewerResult = z.infer<typeof ReviewerSchema>;

type ReviewerInput = {
  novel: NovelRow;
  episodes: EpisodeRow[];
  draftBody: string;
};

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function formatEpisodeContext(episodes: EpisodeRow[]): string {
  if (episodes.length === 0) return "(none)";
  return episodes
    .map((episode) => {
      const body = truncateText(episode.body, 1000);
      return `Episode ${episode.episode_number}: ${body}`;
    })
    .join("\n\n");
}

export class ReviewerAgent {
  constructor(
    private readonly client: import("@google/genai").GoogleGenAI,
    private readonly model: string
  ) {}

  async review(input: ReviewerInput): Promise<ReviewerResult> {
    const systemInstruction = loadReviewerSystemPrompt();

    const promptTemplate = loadReviewerPromptTemplate();
    const prompt = promptTemplate
      .replace("${title}", input.novel.title)
      .replace("${storyBible}", input.novel.story_bible)
      .replace("${previousEpisodes}", formatEpisodeContext(input.episodes))
      .replace("${draftBody}", input.draftBody);

    return generateJson(this.client, {
      model: this.model,
      systemInstruction,
      prompt,
      schema: ReviewerSchema,
      temperature: 0.3,
      maxOutputTokens: 900,
    });
  }
}
