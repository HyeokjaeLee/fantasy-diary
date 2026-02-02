import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";

import { ReviewerAgent } from "../agents/reviewerAgent";
import { WriterAgent, type WriterResult } from "../agents/writerAgent";
import { AgentError } from "../errors/agentError";
import { createGenAIClient, embedText } from "../lib/genai";
import {
  type CharacterInsert,
  type EpisodeRow,
  fetchCharacters,
  fetchEpisodes,
  fetchLocations,
  fetchNovel,
  insertEpisode,
  type LocationInsert,
  type NovelRow,
  upsertCharacters,
  upsertEpisodeCharacters,
  upsertEpisodeLocations,
  upsertLocations,
} from "../repositories/novelRepository";

type WorkflowOptions = {
  novelId: string;
  maxReviewLoops?: number;
  ragEpisodeCount?: number;
};

type WorkflowResult = {
  episode: EpisodeRow;
  writerOutput: WriterResult;
};

const DEFAULT_REVIEW_LOOPS = 7;
const DEFAULT_RAG_COUNT = 2;
const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";

function getModelFromEnv(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}

function getEmbeddingModelFromEnv(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}

function pickRecentEpisodes(
  episodes: EpisodeRow[],
  count: number
): EpisodeRow[] {
  if (episodes.length <= count) return episodes;

  return episodes.slice(-count);
}

function nextEpisodeNumber(episodes: EpisodeRow[]): number {
  if (episodes.length === 0) return 1;
  const last = episodes[episodes.length - 1];

  return (last?.episode_number ?? 0) + 1;
}

function sanitizeFeedback(error: AgentError): string {
  return JSON.stringify(error.toLLMResponse());
}

function buildCharacterInsert(
  novel: NovelRow,
  items: WriterResult["newCharacters"]
): CharacterInsert[] {
  if (!items || items.length === 0) return [];

  return items.map((item) => ({
    novel_id: novel.id,
    name: item.name,
    traits: item.traits ?? null,
    personality: item.personality ?? null,
    description: item.description ?? null,
  }));
}

function buildLocationInsert(
  novel: NovelRow,
  items: WriterResult["newLocations"]
): LocationInsert[] {
  if (!items || items.length === 0) return [];

  return items.map((item) => ({
    novel_id: novel.id,
    name: item.name,
    description: item.description ?? null,
  }));
}

function formatInitialPlotSeeds(novel: NovelRow): string | undefined {
  if (!novel.initial_plot_seeds || novel.plot_seeds_resolved) {
    return undefined;
  }

  try {
    const seeds = typeof novel.initial_plot_seeds === 'string'
      ? JSON.parse(novel.initial_plot_seeds)
      : novel.initial_plot_seeds;

    if (!Array.isArray(seeds) || seeds.length === 0) {
      return undefined;
    }

    return seeds.map((seed, index) => `${index + 1}. ${seed}`).join('\n');
  } catch {
    return undefined;
  }
}

export async function generateEpisodeWorkflow(
  options: WorkflowOptions
): Promise<WorkflowResult> {
  const client = createSupabaseAdminClient();

  const [novel, episodes, characters, locations] = await Promise.all([
    fetchNovel(client, options.novelId),
    fetchEpisodes(client, options.novelId),
    fetchCharacters(client, options.novelId),
    fetchLocations(client, options.novelId),
  ]);
  const episodeNumber = nextEpisodeNumber(episodes);
  const ragEpisodes = pickRecentEpisodes(
    episodes,
    options.ragEpisodeCount ?? DEFAULT_RAG_COUNT
  );

  const initialPlotSeeds = formatInitialPlotSeeds(novel);

  const model = getModelFromEnv();
  const aiClient = createGenAIClient();
  const writer = new WriterAgent(aiClient, model);
  const reviewer = new ReviewerAgent(aiClient, model);
  const reviewLoops = options.maxReviewLoops ?? DEFAULT_REVIEW_LOOPS;

  let feedback: string | undefined;
  let lastReviewFeedback: string | undefined;
  let lastWriterFeedback: string | undefined;
  let writerOutput: WriterResult | null = null;

  for (let attempt = 0; attempt < reviewLoops; attempt += 1) {
    try {
      writerOutput = await writer.generate({
        novel,
        episodeNumber,
        episodes: ragEpisodes,
        characters,
        locations,
        feedback,
        initialPlotSeeds,
      });
    } catch (error) {
      if (error instanceof AgentError) {
        feedback = sanitizeFeedback(error);
        lastWriterFeedback = feedback;
        continue;
      }
      throw error;
    }

    const review = await reviewer.review({
      novel,
      episodes,
      draftBody: writerOutput.body,
    });

    if (review.approved) {
      break;
    }

    feedback = review.feedback;
    lastReviewFeedback = review.feedback;
    writerOutput = null;
  }

  if (!writerOutput) {
    const details: Record<string, unknown> = {};
    if (lastReviewFeedback) details.last_feedback = lastReviewFeedback;
    if (lastWriterFeedback) details.last_writer_feedback = lastWriterFeedback;

    throw new AgentError({
      type: "VALIDATION_ERROR",
      code: "INVALID_ARGUMENT",
      message: "Reviewer did not approve the draft within the allowed attempts",
      details: Object.keys(details).length > 0 ? details : undefined,
    });
  }

  const embedding = await embedText(aiClient, {
    model: getEmbeddingModelFromEnv(),
    text: writerOutput.body,
  });

  const episode = await insertEpisode(client, {
    novel_id: novel.id,
    episode_number: episodeNumber,
    body: writerOutput.body,
    embedding: embedding ?? null,
    embedding_model: embedding ? getEmbeddingModelFromEnv() : null,
  });

  const newCharacters = buildCharacterInsert(novel, writerOutput.newCharacters);
  const newLocations = buildLocationInsert(novel, writerOutput.newLocations);

  const [savedCharacters, savedLocations] = await Promise.all([
    upsertCharacters(client, newCharacters),
    upsertLocations(client, newLocations),
  ]);

  await Promise.all([
    upsertEpisodeCharacters(
      client,
      savedCharacters.map((character) => ({
        episode_id: episode.id,
        character_id: character.id,
      }))
    ),
    upsertEpisodeLocations(
      client,
      savedLocations.map((location) => ({
        episode_id: episode.id,
        location_id: location.id,
      }))
    ),
  ]);

  return { episode, writerOutput };
}
