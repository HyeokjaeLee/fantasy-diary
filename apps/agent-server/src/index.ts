import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import type { TablesInsert } from "@fantasy-diary/shared/supabase/type";
import { GoogleGenAI } from "@google/genai";
import { assert } from "es-toolkit";

import {
  getNextEpisodeNo,
  getPreviousEpisodeForPrompt,
  indexEpisodeFacts,
  indexEpisodeSummary,
  insertPlotSeed,
  insertEpisode,
  markPlotSeedsIntroduced,
  ragSearchChunks,
  ragSearchSummaries,
  resolvePlotSeeds,
  upsertCharacter,
  upsertLocation,
} from "./db/index";
import { AgentError } from "./errors/agentError";
import {
  extractEpisodeFacts,
  extractEpisodeEntities,
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

    const startsWithAtmosphere = (text: string): boolean => {
      const start = text.trimStart().slice(0, 40);
      // Keep this list generic (works across novels) and only for *opening* detection.
      return /^(어둠|침묵|정적|바람|추위|밤|새벽|눈|비)(이|가|은|는)?\b/.test(start);
    };

    const hasExplicitClockTime = (text: string): boolean => {
      // Ban explicit clock time mentions in content (story_time is persisted separately).
      // - 오후 6시 / 오후 6시 17분
      // - 6시 17분
      // - 18:30
      return (
        /(오전|오후)\s*\d{1,2}\s*시(\s*\d{1,2}\s*분)?/.test(text) ||
        /\b\d{1,2}\s*시\s*\d{1,2}\s*분\b/.test(text) ||
        /\b\d{1,2}:\d{2}\b/.test(text)
      );
    };

    // Heuristic: strip common Korean postpositions from the end of a token.
    // This helps us pick more specific continuity anchor keywords (e.g., "뒷문으로" -> "뒷문").
    const stripKoreanParticleSuffix = (raw: string): string => {
      let t = raw.trim().replaceAll(" ", "");
      if (!t) return t;

      const suffixes = [
        // 2-3 char particles
        "으로",
        "에서",
        "에게",
        "까지",
        "부터",
        "처럼",
        "보다",
        // 1 char particles
        "을",
        "를",
        "은",
        "는",
        "이",
        "가",
        "에",
        "의",
        "와",
        "과",
        "도",
        "만",
        "로",
      ];

      // Strip repeatedly in case of stacked suffixes.
      for (let i = 0; i < 3; i++) {
        const next = suffixes.find((s) => t.length > s.length && t.endsWith(s));
        if (!next) break;
        t = t.slice(0, -next.length);
      }

      return t;
    };

    const continuityAnchor =
      previousEpisode && typeof previousEpisode.content_tail === "string"
        ? (() => {
            const tail = normalizeForMatch(previousEpisode.content_tail);

            // Extract a few trailing "anchor tokens" from the previous tail.
            // We avoid verbatim sentence anchoring because it is fragile (quotes, odd unicode, etc.).
            const stopwords = new Set(
              [
                // pronouns / determiners
                "나",
                "저",
                "우리",
                "너",
                "당신",
                "그",
                "그녀",
                "그들",
                "이것",
                "저것",
                // very common nouns
                "사람",
                "시간",
                "때",
                "순간",
                "상황",
                "생각",
              ].map((v) => v.replaceAll(" ", "")),
            );

            const tokens = (tail.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [])
              .map((t) => stripKoreanParticleSuffix(t))
              .map((t) => t.trim())
              .filter((t) => t.length >= 2)
              .filter((t) => !stopwords.has(t));

            // Prefer more specific tokens from the tail.
            const anchorTokens = Array.from(new Set(tokens.slice(-20)))
              .filter((t) => /^[가-힣A-Za-z0-9]{2,}$/.test(t))
              .slice(-4);

            return anchorTokens.length > 0
              ? { tokens: anchorTokens, display: anchorTokens.join(", ") }
              : null;
          })()
        : null;

    const guardrails = [
      `분량(하드 제한): ${lengthRange.min}~${lengthRange.max}자`,
      "연속성(하드 제한): 첫 2문단은 직전 장면 발췌의 즉시 결과로만 구성 (프롤로그/세계관 소개/상황 정리/장소 점프/시간 점프 금지)",
      "금지: 새 인물/새 고유명사(조직/지명 포함)/새 설정을 갑자기 도입하지 마라. 필요하면 '그 남자/그 여자/그 목소리'처럼 익명 처리.",
      "오프닝(하드 제한): 첫 문장은 배경/날씨/분위기(어둠/추위/바람/정적 등)로 시작하지 말고, 반드시 인물의 행동/선택/대사로 시작.",
      "시간 표현(하드 제한): 본문에 숫자 시각 표기 금지(예: '오전/오후 N시', 'N시 N분', 'HH:MM'). story_time은 DB에 저장되므로 상대 표현(잠시 후/몇 분 뒤/해가 기울 무렵)을 우선 사용.",
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
              .select(
                "id,name,name_revealed,descriptor,first_appearance_excerpt,personality,gender,birthday",
              )
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

        // Hard continuity enforcement: require some anchor keywords from the previous tail.
        if (continuityAnchor) {
          const start = normalizeForMatch(content.slice(0, 800));
          const present = continuityAnchor.tokens.filter((t) => start.includes(t));
          const requiredCount = Math.min(2, continuityAnchor.tokens.length);

          if (present.length < Math.max(1, requiredCount)) {
            const instruction = [
              "연속성 하드 제한 위반: 새 회차 초반이 직전 장면 발췌와 단절됐다.",
              "첫 2문단 안에서 직전 장면의 상황/행동/대사를 **직접 이어서** 서술하라.",
              `아래 키워드 중 최소 ${Math.max(1, requiredCount)}개를 첫 2문단에 **그대로** 포함하라: ${
                continuityAnchor.display
              }`,
              "추가 규칙: 장소/시간 점프 없이 같은 장면을 이어서 쓴다.",
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

        // Avoid cliché "atmosphere-first" openings and explicit clock times.
        // If violated, request a rewrite while keeping continuity.
        {
          const trimmed = content.trimStart();
          const hasBadOpening = startsWithAtmosphere(trimmed);
          const hasBadTime = hasExplicitClockTime(content);

          if (hasBadOpening || hasBadTime) {
            const reasons: string[] = [];
            if (hasBadOpening) reasons.push("배경/분위기(어둠/추위 등)로 시작하는 오프닝");
            if (hasBadTime) reasons.push("숫자 시각(오전/오후 N시, N시 N분, HH:MM) 직접 언급");

            const instruction = [
              `오프닝/시간 규칙 위반: ${reasons.join(", ")}.`,
              "수정 지시:",
              "- 첫 문장은 반드시 인물의 행동/선택/대사로 시작하라. (배경/날씨/분위기 묘사로 시작 금지)",
              "- 본문에서 숫자 시각 표기(오전/오후 N시, N시 N분, HH:MM)를 모두 제거하고, 상대 표현(잠시 후/몇 분 뒤/해가 기울 무렵)으로 바꿔라.",
              "- 연속성 유지: 직전 장면 발췌의 즉시 결과에서 끊기지 않게 이어서 쓴다.",
              "- 새 설정/새 고유명사 추가 금지.",
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

    // Extract structured context and persist it for future episodes.
    // This makes characters/locations/plot_seeds usable as canonical context.
    const extractedEntities = await extractEpisodeEntities({
      ai,
      model: geminiModel,
      storyBible,
      prefetchedContext: writerPrefetchedContext,
      episodeContent: generated.episode_content,
    });

    // 모델이 캐릭터를 비워버리는 경우(특히 1인칭/이름 미공개 초반부)가 잦아서,
    // 최소 1개의 "이름 미공개 주인공" 캐릭터는 항상 남기도록 방어한다.
    const entities = (() => {
      if (extractedEntities.characters.length > 0) return extractedEntities;

      const content = generated.episode_content;
      const hasFirstPerson =
        content.includes("나는") || content.includes("내가") || content.includes("나 ");

      const descriptor = hasFirstPerson ? "화자(1인칭)" : "주인공(이름 미공개)";
      const excerpt = content.trim().slice(0, 240);

      return {
        ...extractedEntities,
        characters: [
          {
            name: null,
            name_revealed: false,
            descriptor,
            ...(excerpt ? { first_appearance_excerpt: excerpt } : {}),
            personality: "생존을 위해 상황을 관찰하며 조심스럽게 행동한다.",
          },
        ],
      };
    })();

    const characterIds = new Set<string>();
    const characterNames = new Set<string>();
    let protagonistCharacterId: string | null = null;

    const looksLikeProtagonist = (descriptor: string | null): boolean => {
      const d = (descriptor ?? "").trim();
      if (!d) return false;
      return d.includes("화자") || d.includes("주인공") || d.includes("1인칭");
    };

    for (const c of entities.characters) {
      const name = typeof c.name === "string" ? c.name.trim() : null;
      const nameRevealed = Boolean(c.name_revealed && name);
      const descriptor = typeof c.descriptor === "string" ? c.descriptor.trim() : null;
      const firstExcerpt =
        typeof c.first_appearance_excerpt === "string" ? c.first_appearance_excerpt.trim() : null;
      const nameEvidence =
        typeof c.name_evidence_excerpt === "string" ? c.name_evidence_excerpt.trim() : null;

      const saved = await upsertCharacter({
        supabase,
        args: {
          novel_id: targetNovelId,
          ...(typeof c.id === "string" && c.id.trim() ? { id: c.id.trim() } : {}),
          name: nameRevealed ? name : null,
          name_revealed: nameRevealed,
          ...(descriptor ? { descriptor } : {}),
          ...(firstExcerpt ? { first_appearance_excerpt: firstExcerpt } : {}),
          ...(nameEvidence ? { name_evidence_excerpt: nameEvidence } : {}),
          ...(nameRevealed ? { name_revealed_in_episode_id: episode.id } : {}),
          ...(firstExcerpt ? { first_appearance_episode_id: episode.id } : {}),
          personality: c.personality,
          ...(typeof c.gender !== "undefined" ? { gender: c.gender } : {}),
          ...(typeof c.birthday !== "undefined" ? { birthday: c.birthday } : {}),
        },
      });

      characterIds.add(saved.id);
      if (typeof saved.name === "string" && saved.name.trim()) characterNames.add(saved.name.trim());

      if (!protagonistCharacterId && !saved.name && looksLikeProtagonist(descriptor)) {
        protagonistCharacterId = saved.id;
      }
    }

    const locationNames = new Set<string>();
    for (const l of entities.locations) {
      const name = l.name.trim();
      if (!name) continue;
      await upsertLocation({
        supabase,
        args: {
          novel_id: targetNovelId,
          name,
          situation: l.situation,
        },
      });
      locationNames.add(name);
    }

    for (const p of entities.plot_seeds) {
      const rawPlotCharacterNames = (p.character_names ?? [])
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      const character_ids = (p.character_ids ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && characterIds.has(id));

      // plot_seeds 쪽에서 '나/저/우리/주인공/화자' 등을 캐릭터명으로 주는 경우,
      // 해당 에피소드에서 생성된 주인공(이름 미공개) 캐릭터로 연결한다.
      if (protagonistCharacterId) {
        const compactSet = new Set(
          rawPlotCharacterNames.map((n) => n.replaceAll(" ", ""))
        );
        const hasProtagonistAlias =
          compactSet.has("나") ||
          compactSet.has("저") ||
          compactSet.has("우리") ||
          compactSet.has("주인공") ||
          compactSet.has("화자");
        if (hasProtagonistAlias) character_ids.push(protagonistCharacterId);

        const mentionsProtagonistInDetail =
          typeof p.detail === "string" &&
          (p.detail.includes("주인공") || p.detail.includes("화자") || p.detail.includes("1인칭"));

        // 캐릭터 연결 정보가 비어있지만, 설명상 주인공 중심 떡밥이면 주인공으로 연결한다.
        if (
          mentionsProtagonistInDetail &&
          rawPlotCharacterNames.length === 0 &&
          (p.character_ids ?? []).length === 0
        ) {
          character_ids.push(protagonistCharacterId);
        }
      }

      const character_ids_deduped = Array.from(new Set(character_ids));

      const character_names = rawPlotCharacterNames.filter(
        (n) => n.length > 0 && characterNames.has(n)
      );
      const location_names = (p.location_names ?? [])
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && locationNames.has(n));

      await insertPlotSeed({
        supabase,
        args: {
          novel_id: targetNovelId,
          title: p.title,
          detail: p.detail,
          introduced_in_episode_id: episode.id,
          ...(character_ids_deduped.length > 0 ? { character_ids: character_ids_deduped } : {}),
          ...(character_names.length > 0 ? { character_names } : {}),
          ...(location_names.length > 0 ? { location_names } : {}),
        },
      });
    }

    logger.debug("episode.context.upserted", {
      novelId: targetNovelId,
      episodeNo,
      characters: characterIds.size,
      locations: locationNames.size,
      plotSeeds: entities.plot_seeds.length,
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
