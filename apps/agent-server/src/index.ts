import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import type { TablesInsert } from "@fantasy-diary/shared/supabase/type";
import { GoogleGenAI } from "@google/genai";
import { assert } from "es-toolkit";

import {
  getNextEpisodeNo,
  getPreviousEpisodeForPrompt,
  indexEpisodeFacts,
  indexEpisodeSummary,
  insertEpisode,
  insertEpisodeReview,
  markPlotSeedsIntroduced,
  ragSearchChunks,
  ragSearchSummaries,
  resolvePlotSeeds,
  upsertEpisodeRun,
} from "./db/index";
import { AgentError } from "./errors/agentError";
import {
  extractEpisodeFacts,
  generateEpisodeWithTools,
  reviewEpisodeConsistency,
  reviewEpisodeContinuity,
} from "./gemini";
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

    if (error)
      throw new AgentError({
        type: "DATABASE_ERROR",
        code: "QUERY_FAILED",
        message: `load novels: ${error.message}`,
        details: { table: "novels", op: "select_active" },
        retryable: true,
      });

    for (const n of data ?? []) targetNovelIds.push(n.id);
  } else {
    throw new AgentError({
      type: "VALIDATION_ERROR",
      code: "INVALID_ARGUMENT",
      message: `Unknown --kind: ${kind}`,
      details: { arg: "kind", value: kind },
    });
  }

  const results: Array<{
    novel_id: string;
    episode_no: number;
    episode_id?: string;
    status: "ok" | "dry_run" | "review_failed";
    issues?: unknown;
  }> = [];

  let hadFailures = false;

  for (const targetNovelId of targetNovelIds) {
    logger.info("novel.start", { novelId: targetNovelId });

    const episodeNo = await getNextEpisodeNo({ supabase, novelId: targetNovelId });
    const maxEpisodeNo = episodeNo - 1;

    if (!dryRun)
      await upsertEpisodeRun({
        supabase,
        novelId: targetNovelId,
        episodeNo,
        status: "drafting",
        attemptCount: 0,
        lastReviewIssues: [],
        lastRevisionInstruction: null,
        episodeId: null,
      });

    const previousEpisode =
      maxEpisodeNo >= 1
        ? await getPreviousEpisodeForPrompt({
            supabase,
            novelId: targetNovelId,
            episodeNo: maxEpisodeNo,
            maxChars: 2500,
          })
        : null;

    const tool = createGeminiSupabaseCallableTool({
      supabase,
      geminiApiKey,
      geminiEmbeddingModel,
      ragEmbeddingModelId,
      logger,
      allowWrites: false,
    });

    logger.info("episode.generate.start", {
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
      model: geminiModel,
    });

    const previous2Episode =
      maxEpisodeNo - 1 >= 1
        ? await getPreviousEpisodeForPrompt({
            supabase,
            novelId: targetNovelId,
            episodeNo: maxEpisodeNo - 1,
            maxChars: 2500,
          })
        : null;

    const maxDraftAttempts = 5;
    let draftRevisionInstruction: string | undefined;
    let generated: Awaited<ReturnType<typeof generateEpisodeWithTools>> | null = null;
    let reviewFailed = false;
    let extractedFactsForPersist: string[] | undefined;
    let finalAttempt: number | undefined;
    let finalContinuityReview: Awaited<ReturnType<typeof reviewEpisodeContinuity>> | undefined;
    let finalConsistencyReview: Awaited<ReturnType<typeof reviewEpisodeConsistency>> | undefined;

     const { data: novelRows, error: novelLoadError } = await supabase
       .from("novels")
       .select("story_bible")
       .eq("id", targetNovelId)
       .limit(1);

     if (novelLoadError)
       throw new AgentError({
         type: "DATABASE_ERROR",
         code: "QUERY_FAILED",
         message: `load novel story_bible: ${novelLoadError.message}`,
         details: { table: "novels", op: "select_story_bible" },
         retryable: true,
       });

     const storyBibleRaw = typeof novelRows?.[0]?.story_bible === "string" ? novelRows[0].story_bible : "";
     const storyBible = storyBibleRaw.trim().slice(0, 6000);

    const t0 = Date.now();

    for (let attempt = 1; attempt <= maxDraftAttempts; attempt++) {
      if (!dryRun)
        await upsertEpisodeRun({
          supabase,
          novelId: targetNovelId,
          episodeNo,
          status: "drafting",
          attemptCount: attempt,
        });

      generated = await generateEpisodeWithTools({
        ai,
        model: geminiModel,
        tool,
        novelId: targetNovelId,
        episodeNo,
        maxEpisodeNo,
        previousEpisode,
        revisionInstruction: draftRevisionInstruction,
      });

      if (!dryRun)
        await upsertEpisodeRun({
          supabase,
          novelId: targetNovelId,
          episodeNo,
          status: "reviewing",
          attemptCount: attempt,
        });

      const continuity = await reviewEpisodeContinuity({
        ai,
        model: geminiModel,
        previousEpisodes: [previous2Episode, previousEpisode].filter(
          (e): e is NonNullable<typeof e> => Boolean(e)
        ),
        draft: generated,
      });

      if (!continuity.passed) {
        const instruction =
          continuity.revision_instruction ??
          continuity.issues.map((i) => `- (${i.severity}) ${i.description}`).join("\n");

        if (!dryRun)
          await upsertEpisodeRun({
            supabase,
            novelId: targetNovelId,
            episodeNo,
            status: attempt === maxDraftAttempts ? "review_failed" : "drafting",
            attemptCount: attempt,
            lastReviewIssues: continuity.issues,
            lastRevisionInstruction: instruction,
          });

        if (attempt === maxDraftAttempts) {
          hadFailures = true;
          reviewFailed = true;

          logger.warn("episode.review.failed", {
            novelId: targetNovelId,
            episodeNo,
            issues: continuity.issues,
          });

          if (!dryRun)
            await insertEpisodeReview({
              supabase,
              novelId: targetNovelId,
              episodeNo,
              episodeId: null,
              attempt,
              reviewType: "continuity",
              passed: false,
              issues: continuity.issues,
              revisionInstruction: instruction,
              model: geminiModel,
            });

          results.push({
            novel_id: targetNovelId,
            episode_no: episodeNo,
            status: "review_failed",
            issues: continuity.issues,
          });

          break;
        }

        draftRevisionInstruction = instruction;
        continue;
      }

      const facts = await extractEpisodeFacts({
        ai,
        model: geminiModel,
        episodeContent: generated.episode_content,
      });

      const groundingQuery = facts.join("\n").slice(0, 1500).trim();
      const groundingChunks: Array<{
        kind: "fact" | "episode";
        episode_no: number;
        similarity: number;
        content: string;
      }> = [];

      if (groundingQuery && maxEpisodeNo >= 1) {
        const toHits = (value: unknown): Array<{
          episode_no: number;
          similarity: number;
          content: string;
        }> => {
          if (!Array.isArray(value)) return [];

          const hits: Array<{ episode_no: number; similarity: number; content: string }> = [];
          for (const row of value) {
            if (!row || typeof row !== "object") continue;
            const r = row as Record<string, unknown>;
            const episodeNo = r.episode_no;
            const similarity = r.similarity;
            const content = r.content;
            if (typeof episodeNo !== "number") continue;
            if (typeof similarity !== "number") continue;
            if (typeof content !== "string" || content.trim().length === 0) continue;
            hits.push({ episode_no: episodeNo, similarity, content: content.trim() });
          }

          hits.sort((a, b) => b.similarity - a.similarity);
          return hits.slice(0, 10);
        };

        const summaryHits = toHits(
          await ragSearchSummaries({
            supabase,
            geminiApiKey,
            geminiEmbeddingModel,
            ragEmbeddingModelId,
            args: {
              novel_id: targetNovelId,
              query: groundingQuery,
              max_episode_no: maxEpisodeNo,
              match_count: 8,
            },
          })
        );

        for (const h of summaryHits) groundingChunks.push({ kind: "episode", ...h });

        const factHits = toHits(
          await ragSearchChunks({
            supabase,
            geminiApiKey,
            geminiEmbeddingModel,
            ragEmbeddingModelId,
            args: {
              novel_id: targetNovelId,
              query: groundingQuery,
              chunk_kind: "fact",
              max_episode_no: maxEpisodeNo,
              match_count: 8,
            },
          })
        );

        for (const h of factHits) groundingChunks.push({ kind: "fact", ...h });
      }

      const consistency = await reviewEpisodeConsistency({
        ai,
        model: geminiModel,
        storyBible,
        previousEpisodes: [previous2Episode, previousEpisode].filter(
          (e): e is NonNullable<typeof e> => Boolean(e)
        ),
        groundingChunks,
        extractedFacts: facts,
        draft: generated,
      });

      if (consistency.passed) {
        extractedFactsForPersist = facts;
        finalAttempt = attempt;
        finalContinuityReview = continuity;
        finalConsistencyReview = consistency;
        break;
      }

      const instruction =
        consistency.revision_instruction ??
        consistency.issues.map((i) => `- (${i.severity}) ${i.description}`).join("\n");

      if (!dryRun)
        await upsertEpisodeRun({
          supabase,
          novelId: targetNovelId,
          episodeNo,
          status: attempt === maxDraftAttempts ? "review_failed" : "drafting",
          attemptCount: attempt,
          lastReviewIssues: consistency.issues,
          lastRevisionInstruction: instruction,
        });

      if (attempt === maxDraftAttempts) {
        hadFailures = true;
        reviewFailed = true;

        logger.warn("episode.review.failed", {
          novelId: targetNovelId,
          episodeNo,
          issues: consistency.issues,
        });

        if (!dryRun) {
          await insertEpisodeReview({
            supabase,
            novelId: targetNovelId,
            episodeNo,
            episodeId: null,
            attempt,
            reviewType: "continuity",
            passed: true,
            issues: continuity.issues,
            revisionInstruction: continuity.revision_instruction ?? null,
            model: geminiModel,
          });

          await insertEpisodeReview({
            supabase,
            novelId: targetNovelId,
            episodeNo,
            episodeId: null,
            attempt,
            reviewType: "consistency",
            passed: false,
            issues: consistency.issues,
            revisionInstruction: instruction,
            model: geminiModel,
          });
        }

        results.push({
          novel_id: targetNovelId,
          episode_no: episodeNo,
          status: "review_failed",
          issues: consistency.issues,
        });

        break;
      }

      draftRevisionInstruction = instruction;
    }

    if (reviewFailed) {
      logger.info("novel.done", { novelId: targetNovelId, episodeNo });
      continue;
    }

    if (!generated)
      throw new AgentError({
        type: "UNEXPECTED_ERROR",
        code: "UNKNOWN",
        message: "Episode generation failed",
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
      results.push({ novel_id: targetNovelId, episode_no: episodeNo, status: "dry_run" });
      logger.info("episode.dry_run", { novelId: targetNovelId, episodeNo });
      continue;
    }

    const stagedEpisode: TablesInsert<"episodes"> = {
      novel_id: targetNovelId,
      episode_no: episodeNo,
      story_time: generated.story_time,
      content: generated.episode_content,
    };

    logger.info("episode.persist.start", { novelId: targetNovelId, episodeNo });

    const episode = await insertEpisode({
      supabase,
      novelId: targetNovelId,
      episodeNo,
      storyTime: stagedEpisode.story_time,
      episodeContent: stagedEpisode.content,
    });

    await upsertEpisodeRun({
      supabase,
      novelId: targetNovelId,
      episodeNo,
      status: "persisted",
      attemptCount: finalAttempt ?? maxDraftAttempts,
      lastReviewIssues: [],
      lastRevisionInstruction: null,
      episodeId: episode.id,
    });

    if (finalContinuityReview && finalAttempt)
      await insertEpisodeReview({
        supabase,
        novelId: targetNovelId,
        episodeNo,
        episodeId: episode.id,
        attempt: finalAttempt,
        reviewType: "continuity",
        passed: finalContinuityReview.passed,
        issues: finalContinuityReview.issues,
        revisionInstruction: finalContinuityReview.revision_instruction ?? null,
        model: geminiModel,
      });

    if (finalConsistencyReview && finalAttempt)
      await insertEpisodeReview({
        supabase,
        novelId: targetNovelId,
        episodeNo,
        episodeId: episode.id,
        attempt: finalAttempt,
        reviewType: "consistency",
        passed: finalConsistencyReview.passed,
        issues: finalConsistencyReview.issues,
        revisionInstruction: finalConsistencyReview.revision_instruction ?? null,
        model: geminiModel,
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

    const facts = extractedFactsForPersist ??
      (await extractEpisodeFacts({
        ai,
        model: geminiModel,
        episodeContent: generated.episode_content,
      }));

    await indexEpisodeFacts({
      supabase,
      novelId: targetNovelId,
      episodeId: episode.id,
      episodeNo,
      facts,
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
      status: "ok",
    });

    logger.info("novel.done", { novelId: targetNovelId, episodeNo });
  }

  logger.info("run.done", { count: results.length, hadFailures });

  if (hadFailures) {
    process.exitCode = 1;
  }

  console.info(JSON.stringify({ ok: !hadFailures, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
