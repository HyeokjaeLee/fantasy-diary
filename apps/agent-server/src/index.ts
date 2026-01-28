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
  markPlotSeedsIntroduced,
  ragSearchChunks,
  ragSearchSummaries,
  resolvePlotSeeds,
} from "./db/index";
import { AgentError } from "./errors/agentError";
import {
  extractEpisodeFacts,
  generateEpisodeWithTools,
  reviewEpisodeConsistency,
  reviewEpisodeContinuity,
} from "./gemini/index";
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
  const disableWriterTools = toBoolean(args.disableWriterTools, false);

  const maxTiktakaRaw = args.maxTiktaka;
  const parsedMaxTiktaka =
    typeof maxTiktakaRaw === "string" ? Number(maxTiktakaRaw) : NaN;
  const maxTiktaka =
    Number.isFinite(parsedMaxTiktaka) && parsedMaxTiktaka >= 0
      ? Math.floor(parsedMaxTiktaka)
      : 4;

  const storyTimeStepMinutesRaw = args.storyTimeStepMinutes;
  const storyTimeStepMinutesParsed =
    typeof storyTimeStepMinutesRaw === "string"
      ? Number(storyTimeStepMinutesRaw)
      : NaN;
  const storyTimeStepMinutes =
    Number.isFinite(storyTimeStepMinutesParsed) && storyTimeStepMinutesParsed > 0
      ? Math.floor(storyTimeStepMinutesParsed)
      : 15;

  const startStoryTimeIso =
    typeof args.startStoryTimeIso === "string" && args.startStoryTimeIso.trim()
      ? args.startStoryTimeIso.trim()
      : process.env.START_STORY_TIME_ISO ?? "2026-01-18T17:15:00+09:00";

  const toKstIso = (ms: number): string => {
    const kst = new Date(ms + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace("Z", "+09:00");
  };

  // NOTE: We intentionally do not force time-of-day strings in the episode content.
  // story_time is stored in DB separately and reviewers are too sensitive to explicit clock mentions.

  const logger = createLogger({ quiet, debug });

  const geminiApiKey = process.env.GEMINI_API_KEY;
  assert(geminiApiKey, "Missing required env: GEMINI_API_KEY");

  logger.debug("run.start", { kind, novelId, dryRun });

  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
  const geminiEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  const ragEmbeddingModelId =
    process.env.RAG_EMBEDDING_MODEL_ID ?? `gemini/${geminiEmbeddingModel}`;

  const maxOutputTokensRaw = process.env.GEMINI_MAX_OUTPUT_TOKENS;
  const maxOutputTokensParsed =
    typeof maxOutputTokensRaw === "string" ? Number(maxOutputTokensRaw) : NaN;
  const maxOutputTokensEnv =
    Number.isFinite(maxOutputTokensParsed) && maxOutputTokensParsed > 0
      ? Math.floor(maxOutputTokensParsed)
      : undefined;

  const supabase = createSupabaseAdminClient();

  const geminiTimeoutMsRaw = process.env.GEMINI_HTTP_TIMEOUT_MS;
  const geminiTimeoutMsParsed =
    typeof geminiTimeoutMsRaw === "string" ? Number(geminiTimeoutMsRaw) : NaN;
  const geminiTimeoutMs =
    Number.isFinite(geminiTimeoutMsParsed) && geminiTimeoutMsParsed > 0
      ? Math.floor(geminiTimeoutMsParsed)
      : 180_000;

  const ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      timeout: geminiTimeoutMs,
    },
  });

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
    logger.debug("novel.start", { novelId: targetNovelId });

    const episodeNo = await getNextEpisodeNo({
      supabase,
      novelId: targetNovelId,
    });
    const maxEpisodeNo = episodeNo - 1;

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

    logger.debug("episode.generate.start", {
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

    // writer(작성) ↔ reviewer(검토) 티키타카(수정 사이클) 횟수 제한은
    // 아래 reviewAttempt 루프(maxReviewAttempts)에서 강제한다.
    let generated: Awaited<ReturnType<typeof generateEpisodeWithTools>> | null =
      null;
    let reviewFailed = false;
    let extractedFactsForPersist: string[] | undefined;

    const { data: novelRows, error: novelLoadError } = await supabase
      .from("novels")
      .select("title,genre,story_bible")
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

    const storyBibleRaw =
      typeof novelRows?.[0]?.story_bible === "string"
        ? novelRows[0].story_bible
        : "";
    const storyBible = storyBibleRaw.trim().slice(0, 6000);
    const writerStoryBible = disableWriterTools
      ? storyBible.trim().slice(0, 2500)
      : storyBible;

    const parseLengthRange = (text: string): { min: number; max: number } | null => {
      const m = text.match(
        /(\d{1,3}(?:,\d{3})?)\s*~\s*(\d{1,3}(?:,\d{3})?)\s*자/,
      );
      if (!m) return null;
      const min = Number(m[1].replaceAll(",", ""));
      const max = Number(m[2].replaceAll(",", ""));
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      if (min <= 0 || max <= 0 || min > max) return null;
      return { min: Math.floor(min), max: Math.floor(max) };
    };

    const lengthRange = parseLengthRange(storyBible) ?? { min: 500, max: 700 };

    // Token cap is model-dependent; we use a conservative heuristic and allow override.
    // Goal: prevent multi-thousand-char outputs that repeatedly violate lengthRange.
    const maxOutputTokensBase =
      maxOutputTokensEnv ??
      Math.min(1536, Math.max(384, Math.ceil(lengthRange.max * 0.85)));

    const prevStoryTime = previousEpisode?.story_time ?? null;
    const prevMs = typeof prevStoryTime === "string" ? Date.parse(prevStoryTime) : Number.NaN;
    const stepMs = storyTimeStepMinutes * 60 * 1000;

    const baseMs = Number.isFinite(prevMs)
      ? prevMs + stepMs
      : Date.parse(startStoryTimeIso);

    if (!Number.isFinite(baseMs))
      throw new AgentError({
        type: "VALIDATION_ERROR",
        code: "INVALID_ARGUMENT",
        message: "Invalid startStoryTimeIso",
        details: { startStoryTimeIso },
      });

    const targetStoryTimeMs = baseMs;
    const targetStoryTimeIso = toKstIso(targetStoryTimeMs);

    const normalizeForMatch = (text: string): string => {
      return text.replace(/\s+/g, " ").trim();
    };

    const continuityAnchor =
      previousEpisode && typeof previousEpisode.content_tail === "string"
        ? (() => {
            const tail = normalizeForMatch(previousEpisode.content_tail);

            // Prefer the last 2 meaningful sentences (avoid anchors that are only timestamps).
            const sentences = (tail.match(/[^.!?…]+[.!?…]+/g) ?? [])
              .map((s) => s.trim())
              .filter(Boolean);

            const lastTwo = sentences.length >= 2 ? sentences.slice(-2).join(" ") : "";
            const fallback = tail.slice(-220).trim();
            const selected = normalizeForMatch((lastTwo || fallback).slice(-220));

            return selected.length >= 30 ? { needle: selected, display: selected } : null;
          })()
        : null;

    const guardrails = [
      `분량(하드 제한): ${lengthRange.min}~${lengthRange.max}자`,
      "연속성(하드 제한): 첫 2문단은 직전 장면 발췌의 즉시 결과로만 구성 (프롤로그/세계관 소개/상황 정리/장소 점프/시간 점프 금지)",
      "금지: 새 인물/새 고유명사(조직/지명 포함)/새 설정을 갑자기 도입하지 마라. 필요하면 '그 남자/그 여자/그 목소리'처럼 익명 처리.",
    ].join("\n");

    const novelTitle =
      typeof novelRows?.[0]?.title === "string" ? novelRows[0].title : "";
    const novelGenre =
      typeof novelRows?.[0]?.genre === "string" ? novelRows[0].genre : "";

    const prefetched = disableWriterTools
      ? await (async () => {
          const [charactersRes, locationsRes, plotSeedsRes] = await Promise.all([
            supabase
              .from("characters")
              .select("name,gender,birthday,personality")
              .eq("novel_id", targetNovelId)
              .limit(30),
            supabase
              .from("locations")
              .select("name,situation")
              .eq("novel_id", targetNovelId)
              .limit(30),
            supabase
              .from("plot_seeds")
              .select("title,detail,status")
              .eq("novel_id", targetNovelId)
              .eq("status", "open")
              .limit(30),
          ]);

          if (charactersRes.error)
            throw new AgentError({
              type: "DATABASE_ERROR",
              code: "QUERY_FAILED",
              message: `load characters: ${charactersRes.error.message}`,
              details: { table: "characters", op: "select_for_writer" },
              retryable: true,
            });

          if (locationsRes.error)
            throw new AgentError({
              type: "DATABASE_ERROR",
              code: "QUERY_FAILED",
              message: `load locations: ${locationsRes.error.message}`,
              details: { table: "locations", op: "select_for_writer" },
              retryable: true,
            });

          if (plotSeedsRes.error)
            throw new AgentError({
              type: "DATABASE_ERROR",
              code: "QUERY_FAILED",
              message: `load plot_seeds: ${plotSeedsRes.error.message}`,
              details: { table: "plot_seeds", op: "select_for_writer" },
              retryable: true,
            });

          return {
            characters: charactersRes.data ?? [],
            locations: locationsRes.data ?? [],
            plot_seeds: plotSeedsRes.data ?? [],
          };
        })()
      : null;

    const writerPrefetchedContext = disableWriterTools
      ? (() => {
          const lines: string[] = [];
          lines.push(`novel_id: ${targetNovelId}`);
          if (novelTitle.trim()) lines.push(`title: ${novelTitle.trim()}`);
          if (novelGenre.trim()) lines.push(`genre: ${novelGenre.trim()}`);
          lines.push("");
          lines.push("[story_bible]\n---");
          lines.push(writerStoryBible || "(없음)");
          lines.push("---");

          lines.push("");
          lines.push("[characters]");
          lines.push(
            prefetched && prefetched.characters.length > 0
              ? JSON.stringify(prefetched.characters)
              : "(없음)",
          );

          lines.push("");
          lines.push("[locations]");
          lines.push(
            prefetched && prefetched.locations.length > 0
              ? JSON.stringify(prefetched.locations)
              : "(없음)",
          );

          lines.push("");
          lines.push("[plot_seeds(status=open)]");
          lines.push(
            prefetched && prefetched.plot_seeds.length > 0
              ? JSON.stringify(prefetched.plot_seeds)
              : "(없음)",
          );
          return lines.join("\n");
        })()
      : "";

    logger.debug("episode.context", {
      novelId: targetNovelId,
      episodeNo,
      maxEpisodeNo,
      storyBibleChars: storyBible.length,
      hasPreviousEpisode: Boolean(previousEpisode),
      hasPrevious2Episode: Boolean(previous2Episode),
    });

    const t0 = Date.now();

    const maxReviewAttempts = Math.min(maxTiktaka + 1, 3);
    const maxWriterAttempts = 8;

    let reviewerRevisionInstruction: string | undefined;
    let passedAllReviews = false;

    for (let reviewAttempt = 1; reviewAttempt <= maxReviewAttempts; reviewAttempt++) {
      let writerRevisionInstruction: string | undefined;
      let writerMaxOutputTokens = maxOutputTokensBase;

      let draftWithTime: {
        episode_content: string;
        resolved_plot_seed_ids?: string[];
        story_time: string;
      } | null = null;

      for (let writerAttempt = 1; writerAttempt <= maxWriterAttempts; writerAttempt++) {
        generated = await generateEpisodeWithTools({
          ai,
          model: geminiModel,
          tool,
          novelId: targetNovelId,
          episodeNo,
          maxEpisodeNo,
          previousEpisode,
          revisionInstruction: [guardrails, reviewerRevisionInstruction, writerRevisionInstruction]
            .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
            .join("\n\n"),
          disableTools: disableWriterTools,
          prefetchedContext: writerPrefetchedContext,
          maxOutputTokens: writerMaxOutputTokens,
        });

        const content = generated.episode_content;

        // Hard continuity enforcement: require verbatim carry-over of the last sentence.
        if (continuityAnchor) {
          const start = normalizeForMatch(content.slice(0, 800));
          if (!start.includes(continuityAnchor.needle)) {
            const instruction = [
              "연속성 하드 제한 위반: 새 회차 초반이 직전 장면 발췌와 단절됐다.",
              "첫 2문단 안에 아래 문장을 **그대로** 포함하고(문장 그대로), 그 즉시 반응/결과를 이어서 서술하라.",
              "[직전 장면 마지막 문장(그대로 포함)]",
              "---",
              continuityAnchor.display,
              "---",
              "추가 규칙: 해당 문장을 포함한 뒤, 장소/시간 점프 없이 같은 장면을 이어서 쓴다.",
            ].join("\n");

            if (writerAttempt === maxWriterAttempts) {
              hadFailures = true;
              reviewFailed = true;
              results.push({
                novel_id: targetNovelId,
                episode_no: episodeNo,
                status: "review_failed",
                issues: [{ severity: "high", description: instruction }],
              });
              break;
            }

            writerRevisionInstruction = instruction;
            continue;
          }
        }

        const chars = content.length;
        if (chars < lengthRange.min || chars > lengthRange.max) {
          const delta =
            chars > lengthRange.max
              ? chars - lengthRange.max
              : lengthRange.min - chars;
          const target = Math.floor((lengthRange.min + lengthRange.max) / 2);
          const direction = chars > lengthRange.max ? "축약" : "확장";
          const instruction =
            chars > lengthRange.max
              ? [
                  `분량 하드 제한: ${lengthRange.min}~${lengthRange.max}자. 현재 약 ${chars}자(초과 ${delta}자).`,
                  `목표: 약 ${target}자(±50자)로 ${direction}하라.`,
                  "규칙:",
                  "- 첫 문단은 직전 장면의 즉시 결과로 유지(프롤로그/상황정리 금지).",
                  "- 사건/대사/핵심 감정선은 유지하고, 부연 설명/중복/수식/풍경 묘사/내면 독백을 우선 삭제.",
                  "- 새로운 사건/설정/인물 추가 금지. 장면 수 늘리지 말고 현재 장면을 압축.",
                  "- 기존 사건의 연속성을 유지하고, 새 설정/새 인물/새 고유명사 추가 금지.",
                ].join("\n")
              : [
                  `분량 하드 제한: ${lengthRange.min}~${lengthRange.max}자. 현재 약 ${chars}자(부족 ${delta}자).`,
                  `목표: 약 ${target}자(±50자)로 ${direction}하라.`,
                  "규칙:",
                  "- 첫 문단은 직전 장면의 즉시 결과로 유지(프롤로그/상황정리 금지).",
                  "- 새로운 큰 사건을 추가하지 말고, 현재 장면에 (행동 2개 + 대사 2줄 + 감각/관찰 1줄) 정도를 보강.",
                  "- 관계/목표/사실관계가 바뀌는 설정 추가 금지.",
                  "- 기존 사건의 연속성을 유지하고, 새 설정/새 인물/새 고유명사 추가 금지.",
                ].join("\n");
          if (writerAttempt === maxWriterAttempts) {
            hadFailures = true;
            reviewFailed = true;
            results.push({
              novel_id: targetNovelId,
              episode_no: episodeNo,
              status: "review_failed",
              issues: [{ severity: "high", description: instruction }],
            });
            break;
          }

          const rewriteInstruction = [
            instruction,
            "",
            "[현재 본문(가능한 한 그대로 유지하면서 수정)]",
            "---",
            content,
            "---",
            "위 본문을 기반으로, 연속성/사실관계를 유지한 채 지시사항(분량)만 반영해 다시 작성하라.",
            "주의: 새 장면/새 사건/새 설정/새 인물 추가 금지. 기존 문장은 최대한 유지하고 삭제/추가로만 조정.",
          ].join("\n");

          // Adjust token budget to make the next attempt more likely to hit the range.
          if (chars < lengthRange.min) {
            writerMaxOutputTokens = Math.min(writerMaxOutputTokens + 180, 1536);
          } else {
            writerMaxOutputTokens = Math.max(writerMaxOutputTokens - 180, 256);
          }

          writerRevisionInstruction = rewriteInstruction;
          continue;
        }

        draftWithTime = { ...generated, story_time: targetStoryTimeIso };
        break;
      }

      if (reviewFailed) break;
      if (!draftWithTime) {
        hadFailures = true;
        reviewFailed = true;
        results.push({
          novel_id: targetNovelId,
          episode_no: episodeNo,
          status: "review_failed",
          issues: [{ severity: "high", description: "draft generation failed" }],
        });
        break;
      }

      const continuity = await reviewEpisodeContinuity({
        ai,
        model: geminiModel,
        previousEpisodes: [previous2Episode, previousEpisode].filter(
          (e): e is NonNullable<typeof e> => Boolean(e),
        ),
        draft: draftWithTime,
      });

      if (!continuity.passed) {
        logger.debug("episode.review", {
          novelId: targetNovelId,
          episodeNo,
          attempt: reviewAttempt,
          type: "continuity",
          passed: false,
          issues: continuity.issues.length,
        });

        const instruction =
          continuity.revision_instruction ??
          continuity.issues
            .map((i) => `- (${i.severity}) ${i.description}`)
            .join("\n");

        if (reviewAttempt === maxReviewAttempts) {
          hadFailures = true;
          reviewFailed = true;

          logger.warn("episode.review.failed", {
            novelId: targetNovelId,
            episodeNo,
            issues: continuity.issues,
          });

          results.push({
            novel_id: targetNovelId,
            episode_no: episodeNo,
            status: "review_failed",
            issues: continuity.issues,
          });

          break;
        }

        reviewerRevisionInstruction = instruction;
        continue;
      }

      const facts = await extractEpisodeFacts({
        ai,
        model: geminiModel,
        episodeContent: draftWithTime.episode_content,
      });

      const groundingQuery = facts.join("\n").slice(0, 1500).trim();
      const groundingChunks: Array<{
        kind: "fact" | "episode";
        episode_no: number;
        similarity: number;
        content: string;
      }> = [];

      if (groundingQuery && maxEpisodeNo >= 1) {
        const toHits = (
          value: unknown,
        ): Array<{
          episode_no: number;
          similarity: number;
          content: string;
        }> => {
          if (!Array.isArray(value)) return [];

          const hits: Array<{
            episode_no: number;
            similarity: number;
            content: string;
          }> = [];
          for (const row of value) {
            if (!row || typeof row !== "object") continue;
            const r = row as Record<string, unknown>;
            const episodeNo = r.episode_no;
            const similarity = r.similarity;
            const content = r.content;
            if (typeof episodeNo !== "number") continue;
            if (typeof similarity !== "number") continue;
            if (typeof content !== "string" || content.trim().length === 0)
              continue;
            hits.push({
              episode_no: episodeNo,
              similarity,
              content: content.trim(),
            });
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
          }),
        );

        for (const h of summaryHits)
          groundingChunks.push({ kind: "episode", ...h });

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
          }),
        );

        for (const h of factHits) groundingChunks.push({ kind: "fact", ...h });
      }

      const consistency = await reviewEpisodeConsistency({
        ai,
        model: geminiModel,
        storyBible,
        previousEpisodes: [previous2Episode, previousEpisode].filter(
          (e): e is NonNullable<typeof e> => Boolean(e),
        ),
        groundingChunks,
        extractedFacts: facts,
        draft: draftWithTime,
      });

      if (consistency.passed) {
        logger.debug("episode.review", {
          novelId: targetNovelId,
          episodeNo,
          attempt: reviewAttempt,
          type: "consistency",
          passed: true,
          issues: 0,
          grounding: {
            episode: groundingChunks.filter((c) => c.kind === "episode").length,
            fact: groundingChunks.filter((c) => c.kind === "fact").length,
          },
          facts: facts.length,
        });

        extractedFactsForPersist = facts;
        passedAllReviews = true;
        break;
      }

      logger.debug("episode.review", {
        novelId: targetNovelId,
        episodeNo,
        attempt: reviewAttempt,
        type: "consistency",
        passed: false,
        issues: consistency.issues.length,
        grounding: {
          episode: groundingChunks.filter((c) => c.kind === "episode").length,
          fact: groundingChunks.filter((c) => c.kind === "fact").length,
        },
        facts: facts.length,
      });

      const instruction =
        consistency.revision_instruction ??
        consistency.issues
          .map((i) => `- (${i.severity}) ${i.description}`)
          .join("\n");

      if (reviewAttempt === maxReviewAttempts) {
        hadFailures = true;
        reviewFailed = true;

        logger.warn("episode.review.failed", {
          novelId: targetNovelId,
          episodeNo,
          issues: consistency.issues,
        });

        results.push({
          novel_id: targetNovelId,
          episode_no: episodeNo,
          status: "review_failed",
          issues: consistency.issues,
        });

        break;
      }

      reviewerRevisionInstruction = instruction;
    }

    if (!reviewFailed && !passedAllReviews) {
      hadFailures = true;
      reviewFailed = true;
      results.push({
        novel_id: targetNovelId,
        episode_no: episodeNo,
        status: "review_failed",
        issues: [{ severity: "high", description: "review loop exhausted" }],
      });
    }

    if (reviewFailed) {
      logger.debug("novel.done", { novelId: targetNovelId, episodeNo });
      continue;
    }

    if (!generated)
      throw new AgentError({
        type: "UNEXPECTED_ERROR",
        code: "UNKNOWN",
        message: "Episode generation failed",
      });

    // story_time is assigned deterministically (not extracted).

    logger.debug("episode.generate.done", {
      ms: Date.now() - t0,
      episodeNo,
      contentChars: generated.episode_content.length,
      resolvedPlotSeeds: generated.resolved_plot_seed_ids?.length ?? 0,
    });

    const resolvedPlotSeedIds = Array.from(
      new Set(generated.resolved_plot_seed_ids ?? []),
    ).filter((id) => id.trim().length > 0);

    if (dryRun) {
      results.push({
        novel_id: targetNovelId,
        episode_no: episodeNo,
        status: "dry_run",
      });
      logger.debug("episode.dry_run", { novelId: targetNovelId, episodeNo });
      continue;
    }

    const stagedEpisode: TablesInsert<"episodes"> = {
      novel_id: targetNovelId,
      episode_no: episodeNo,
      story_time: targetStoryTimeIso,
      content: generated.episode_content,
    };

    logger.debug("episode.persist.start", { novelId: targetNovelId, episodeNo });

    const episode = await insertEpisode({
      supabase,
      novelId: targetNovelId,
      episodeNo,
      storyTime: stagedEpisode.story_time,
      episodeContent: stagedEpisode.content,
    });

    logger.debug("episode.persist.inserted", {
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

    const facts =
      extractedFactsForPersist ??
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

    logger.debug("episode.persist.indexed", {
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
      logger.debug("plot_seeds.resolved", {
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

    logger.debug("novel.done", { novelId: targetNovelId, episodeNo });
  }

  logger.debug("run.done", { count: results.length, hadFailures });

  if (hadFailures) {
    process.exitCode = 1;
  }

  console.info(JSON.stringify({ ok: !hadFailures, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
