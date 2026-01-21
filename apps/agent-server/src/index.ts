import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import { GoogleGenAI } from "@google/genai";
import { assert } from "es-toolkit";

import {
  getNextEpisodeNo,
  indexEpisodeSummary,
  insertEpisode,
  markPlotSeedsIntroduced,
  resolvePlotSeeds,
} from "./db/index";
import { generateEpisodeWithTools } from "./gemini";
import { parseArgs, toBoolean } from "./lib/args";
import { createLogger } from "./lib/logger";
import { createGeminiSupabaseCallableTool } from "./tools";

async function main(): Promise<void> {
  const { args } = parseArgs(Bun.argv.slice(2));

  const kind = typeof args.kind === "string" ? args.kind : "daily";
  const novelId = typeof args.novelId === "string" ? args.novelId : undefined;
  const dryRun = toBoolean(args.dryRun, false);
  const quiet = toBoolean(args.quiet, false);
  const debug = toBoolean(args.debug, false);

  const logger = createLogger({ quiet, debug });

  const geminiApiKey = process.env.GEMINI_API_KEY;
  assert(geminiApiKey, "Missing required env: GEMINI_API_KEY");

  logger.info("run.start", { kind, novelId, dryRun });

  const geminiModel = "gemini-3-flash-preview";
  const geminiEmbeddingModel = "text-embedding-004";
  const ragEmbeddingModelId = "gemini/text-embedding-004";

  const supabase = createSupabaseAdminClient();

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const targetNovelIds: string[] = [];

  if (novelId) {
    targetNovelIds.push(novelId);
  } else if (kind === "daily") {
    const { data, error } = await supabase
      .from("novels")
      .select("id")
      .eq("status", "active")
      .limit(50);

    if (error) throw new Error(`load novels: ${error.message}`);

    for (const n of data ?? []) targetNovelIds.push(n.id);
  } else {
    throw new Error(`Unknown --kind: ${kind}`);
  }

  const results: Array<{ novel_id: string; episode_no: number; episode_id?: string }> = [];

  for (const targetNovelId of targetNovelIds) {
    logger.info("novel.start", { novelId: targetNovelId });

    const episodeNo = await getNextEpisodeNo({ supabase, novelId: targetNovelId });
    const maxEpisodeNo = episodeNo - 1;

    const tool = createGeminiSupabaseCallableTool({
      supabase,
      geminiApiKey,
      geminiEmbeddingModel,
      ragEmbeddingModelId,
      logger,
    });

    logger.info("episode.generate.start", {
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
      model: geminiModel,
    });

    const t0 = Date.now();
    const generated = await generateEpisodeWithTools({
      ai,
      model: geminiModel,
      tool,
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
    });
    logger.info("episode.generate.done", {
      ms: Date.now() - t0,
      episodeNo,
      contentChars: generated.episode_content.length,
      resolvedPlotSeeds: generated.resolved_plot_seed_ids?.length ?? 0,
    });

    const resolvedPlotSeedIds = Array.from(
      new Set(generated.resolved_plot_seed_ids ?? [])
    ).filter((id) => id.trim().length > 0);

    if (dryRun) {
      results.push({ novel_id: targetNovelId, episode_no: episodeNo });
      logger.info("episode.dry_run", { novelId: targetNovelId, episodeNo });
      continue;
    }

    logger.info("episode.persist.start", { novelId: targetNovelId, episodeNo });

    const episode = await insertEpisode({
      supabase,
      novelId: targetNovelId,
      episodeNo,
      storyTime: generated.story_time,
      episodeContent: generated.episode_content,
    });

    logger.info("episode.persist.inserted", {
      novelId: targetNovelId,
      episodeNo,
      episodeId: episode.id,
    });

    await markPlotSeedsIntroduced({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      plotSeedIds: tool.getCreatedPlotSeedIds(),
    });

    await indexEpisodeSummary({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      episodeNo,
      episodeContent: generated.episode_content,
      geminiApiKey,
      geminiEmbeddingModel,
      ragEmbeddingModelId,
    });

    logger.info("episode.persist.indexed", {
      novelId: targetNovelId,
      episodeNo,
      episodeId: episode.id,
    });

    await resolvePlotSeeds({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      plotSeedIds: resolvedPlotSeedIds,
    });

    if (resolvedPlotSeedIds.length > 0) {
      logger.info("plot_seeds.resolved", {
        novelId: targetNovelId,
        episodeId: episode.id,
        count: resolvedPlotSeedIds.length,
      });
    }

    results.push({
      novel_id: targetNovelId,
      episode_no: episode.episode_no,
      episode_id: episode.id,
    });

    logger.info("novel.done", { novelId: targetNovelId, episodeNo });
  }

  logger.info("run.done", { count: results.length });
  console.info(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
