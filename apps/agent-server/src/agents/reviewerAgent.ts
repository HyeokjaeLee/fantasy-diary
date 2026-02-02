import { z } from "zod";

import type { EpisodeRow, NovelRow } from "../repositories/novelRepository";
import { generateJson } from "../lib/genai";

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
    const systemInstruction = [
      "You are a reviewer validating a serialized novel episode.",
      "Check for style consistency, setting consistency, repeated expressions, and sentence flow.",
      "Use the story bible as the primary reference for tone and rules.",
      "Approve unless there are clear contradictions, severe repetition, or broken sentences.",
      "If issues are minor or subjective, approve and keep feedback empty.",
      "Return only JSON and do not include markdown or commentary.",
      "Return only JSON that matches the given schema.",
      "Use double quotes for all JSON keys and string values.",
      "Keep the response concise.",
    ].join("\n");

    const prompt = [
      `Novel title: ${input.novel.title}`,
      "Story bible:",
      input.novel.story_bible,
      "\nPrevious episodes:",
      formatEpisodeContext(input.episodes),
      "\nDraft episode:",
      input.draftBody,
    ].join("\n");

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
