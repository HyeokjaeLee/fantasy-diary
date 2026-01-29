import { createSupabaseAdminClient } from "@fantasy-diary/shared/supabase";
import { assert } from "es-toolkit";

import { AgentError } from "./errors/agentError";
import { parseArgs } from "./lib/args";

type RunResult = {
  ok: boolean;
  results: Array<{
    novel_id: string;
    episode_no: number;
    episode_id?: string;
    status: "ok" | "dry_run" | "review_failed";
    issues?: unknown;
  }>;
};

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }

  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "y") return true;
    if (v === "false" || v === "0" || v === "no" || v === "n") return false;
  }

  return fallback;
}

async function deleteNovelDataExceptNovels(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
}): Promise<void> {
  const { supabase, novelId } = params;

  const { data: plotSeedRows, error: plotSeedLoadError } = await supabase
    .from("plot_seeds")
    .select("id")
    .eq("novel_id", novelId)
    .limit(1000);

  if (plotSeedLoadError)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `cleanup: load plot_seeds: ${plotSeedLoadError.message}`,
      details: { table: "plot_seeds", op: "select_ids", novelId },
      retryable: true,
    });

  const plotSeedIds = (plotSeedRows ?? []).map((r) => r.id).filter(Boolean);

  // 1) join tables
  if (plotSeedIds.length > 0) {
    for (let i = 0; i < plotSeedIds.length; i += 200) {
      const batch = plotSeedIds.slice(i, i + 200);

      const { error: delPSC } = await supabase
        .from("plot_seed_characters")
        .delete()
        .in("plot_seed_id", batch);
      if (delPSC)
        throw new AgentError({
          type: "DATABASE_ERROR",
          code: "QUERY_FAILED",
          message: `cleanup: delete plot_seed_characters: ${delPSC.message}`,
          details: { table: "plot_seed_characters", op: "delete", novelId },
          retryable: true,
        });

      const { error: delPSL } = await supabase
        .from("plot_seed_locations")
        .delete()
        .in("plot_seed_id", batch);
      if (delPSL)
        throw new AgentError({
          type: "DATABASE_ERROR",
          code: "QUERY_FAILED",
          message: `cleanup: delete plot_seed_locations: ${delPSL.message}`,
          details: { table: "plot_seed_locations", op: "delete", novelId },
          retryable: true,
        });
    }
  }

  // 2) episode chunks
  const { error: delChunks } = await supabase
    .from("episode_chunks")
    .delete()
    .eq("novel_id", novelId);
  if (delChunks)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `cleanup: delete episode_chunks: ${delChunks.message}`,
      details: { table: "episode_chunks", op: "delete", novelId },
      retryable: true,
    });

  // 3) plot seeds (references episodes via introduced/resolved fk)
  const { error: delSeeds } = await supabase
    .from("plot_seeds")
    .delete()
    .eq("novel_id", novelId);
  if (delSeeds)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `cleanup: delete plot_seeds: ${delSeeds.message}`,
      details: { table: "plot_seeds", op: "delete", novelId },
      retryable: true,
    });

  // 4) episodes
  const { error: delEpisodes } = await supabase
    .from("episodes")
    .delete()
    .eq("novel_id", novelId);
  if (delEpisodes)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `cleanup: delete episodes: ${delEpisodes.message}`,
      details: { table: "episodes", op: "delete", novelId },
      retryable: true,
    });

  // 5) characters/locations
  const { error: delCharacters } = await supabase
    .from("characters")
    .delete()
    .eq("novel_id", novelId);
  if (delCharacters)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `cleanup: delete characters: ${delCharacters.message}`,
      details: { table: "characters", op: "delete", novelId },
      retryable: true,
    });

  const { error: delLocations } = await supabase
    .from("locations")
    .delete()
    .eq("novel_id", novelId);
  if (delLocations)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `cleanup: delete locations: ${delLocations.message}`,
      details: { table: "locations", op: "delete", novelId },
      retryable: true,
    });
}

async function getEpisodeNos(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
}): Promise<number[]> {
  const { supabase, novelId } = params;
  const { data, error } = await supabase
    .from("episodes")
    .select("episode_no")
    .eq("novel_id", novelId)
    .order("episode_no", { ascending: true });
  if (error)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `load episodes: ${error.message}`,
      details: { table: "episodes", op: "select_episode_no", novelId },
      retryable: true,
    });

  return (data ?? [])
    .map((r) => r.episode_no)
    .filter((n): n is number => typeof n === "number");
}

async function countByNovelId(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  table: string;
  novelId: string;
}): Promise<number> {
  const { supabase, table, novelId } = params;
  // Use dynamic table names with 'any' to avoid deep type instantiation.
  const client = supabase as unknown as any;
  const { count, error } = await client
    .from(table)
    .select("id", { head: true, count: "exact" })
    .eq("novel_id", novelId);
  if (error)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `count ${table}: ${error.message}`,
      details: { table, novelId },
      retryable: true,
    });

  return count ?? 0;
}

async function countPlotSeedJoins(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  novelId: string;
}): Promise<{ plot_seed_characters: number; plot_seed_locations: number }> {
  const { supabase, novelId } = params;

  const { data: plotSeeds, error: psErr } = await supabase
    .from("plot_seeds")
    .select("id")
    .eq("novel_id", novelId)
    .limit(2000);
  if (psErr)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `load plot_seeds ids: ${psErr.message}`,
      details: { table: "plot_seeds", novelId },
      retryable: true,
    });

  const ids = (plotSeeds ?? []).map((r) => r.id).filter(Boolean);
  if (ids.length === 0)
    return { plot_seed_characters: 0, plot_seed_locations: 0 };

  const { count: c1, error: e1 } = await supabase
    .from("plot_seed_characters")
    .select("plot_seed_id", { head: true, count: "exact" })
    .in("plot_seed_id", ids);
  if (e1)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `count plot_seed_characters: ${e1.message}`,
      details: { table: "plot_seed_characters", novelId },
      retryable: true,
    });

  const { count: c2, error: e2 } = await supabase
    .from("plot_seed_locations")
    .select("plot_seed_id", { head: true, count: "exact" })
    .in("plot_seed_id", ids);
  if (e2)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `count plot_seed_locations: ${e2.message}`,
      details: { table: "plot_seed_locations", novelId },
      retryable: true,
    });

  return { plot_seed_characters: c1 ?? 0, plot_seed_locations: c2 ?? 0 };
}

async function runOnceCli(params: {
  novelId: string;
  maxTiktaka: number;
  storyTimeStepMinutes: number;
  startStoryTimeIso?: string;
}): Promise<RunResult> {
  const { novelId, maxTiktaka, storyTimeStepMinutes, startStoryTimeIso } =
    params;

  // Use an absolute path so this works regardless of current working directory.
  const entrypointPath = new URL("./index.ts", import.meta.url).pathname;

  const args: string[] = [
    "bun",
    entrypointPath,
    `--kind=daily`,
    `--novelId=${novelId}`,
    `--maxTiktaka=${maxTiktaka}`,
    `--disableWriterTools=true`,
    `--storyTimeStepMinutes=${storyTimeStepMinutes}`,
    "--quiet=true",
  ];

  if (typeof startStoryTimeIso === "string" && startStoryTimeIso.trim()) {
    args.push(`--startStoryTimeIso=${startStoryTimeIso.trim()}`);
  }

  const proc = Bun.spawnSync(args);

  const stdout = proc.stdout.toString("utf-8").trim();
  const stderr = proc.stderr.toString("utf-8").trim();

  // index.ts는 실패 시에도 JSON을 출력하지만, 예외로 터지면 stderr에 남는다.
  if (proc.exitCode !== 0 && !stdout) {
    const lowered = stderr.toLowerCase();
    const isRateLimited =
      lowered.includes("\"code\":429") ||
      lowered.includes("status: 429") ||
      lowered.includes("resource_exhausted") ||
      lowered.includes("rate limited") ||
      lowered.includes("rate_limited");

    if (isRateLimited) {
      throw new AgentError({
        type: "UPSTREAM_API_ERROR",
        code: "RATE_LIMITED",
        message: "agent-server run rate-limited (429)",
        retryable: true,
        details: { stderr },
      });
    }

    throw new AgentError({
      type: "UNEXPECTED_ERROR",
      code: "UNKNOWN",
      message: `agent-server run failed (exit=${proc.exitCode})`,
      details: { stderr },
    });
  }

  try {
    return JSON.parse(stdout) as RunResult;
  } catch {
    throw new AgentError({
      type: "PARSE_ERROR",
      code: "INVALID_JSON",
      message: "agent-server did not output valid JSON",
      details: { stdout, stderr },
      retryable: true,
    });
  }
}

async function main(): Promise<void> {
  const { args } = parseArgs(Bun.argv.slice(2));

  const novelId = typeof args.novelId === "string" ? args.novelId : undefined;
  assert(novelId, "Missing required arg: --novelId");

  const maxTiktaka = toPositiveInt(args.maxTiktaka, 2);
  const cleanStart = toBoolean(args.cleanStart, false);
  const cleanOnFailure = toBoolean(args.cleanOnFailure, false);
  const cleanOnly = toBoolean(args.cleanOnly, false);
  const storyTimeStepMinutes = toPositiveInt(args.storyTimeStepMinutes, 5);
  const startStoryTimeIso =
    typeof args.startStoryTimeIso === "string" && args.startStoryTimeIso.trim()
      ? args.startStoryTimeIso.trim()
      : undefined;

  const supabase = createSupabaseAdminClient();

  const { data: novelRow, error: novelError } = await supabase
    .from("novels")
    .select("id,title")
    .eq("id", novelId)
    .limit(1)
    .maybeSingle();
  if (novelError)
    throw new AgentError({
      type: "DATABASE_ERROR",
      code: "QUERY_FAILED",
      message: `load novel: ${novelError.message}`,
      details: { table: "novels", op: "select", novelId },
      retryable: true,
    });
  if (!novelRow)
    throw new AgentError({
      type: "VALIDATION_ERROR",
      code: "INVALID_ARGUMENT",
      message: "Novel not found",
      details: { novelId },
    });

  if (cleanStart || cleanOnly) {
    console.error(
      `[chain] ${cleanOnly ? "cleanOnly" : "cleanStart"}=true: deleting novel data except novels...`,
    );
    await deleteNovelDataExceptNovels({ supabase, novelId });
  }

  if (cleanOnly) {
    const counts = {
      episodes: await countByNovelId({
        supabase,
        table: "episodes",
        novelId,
      }),
      episode_chunks: await countByNovelId({
        supabase,
        table: "episode_chunks",
        novelId,
      }),
      characters: await countByNovelId({
        supabase,
        table: "characters",
        novelId,
      }),
      locations: await countByNovelId({
        supabase,
        table: "locations",
        novelId,
      }),
      plot_seeds: await countByNovelId({
        supabase,
        table: "plot_seeds",
        novelId,
      }),
      ...(await countPlotSeedJoins({ supabase, novelId })),
    };

    console.info(
      JSON.stringify(
        {
          ok: true,
          novel: { id: novelRow.id, title: novelRow.title },
          cleaned: true,
          counts,
        },
        null,
        2,
      ),
    );
    return;
  }

  const episodeNosBefore = await getEpisodeNos({ supabase, novelId });
  console.error(
    `[run] before generate: existing=${JSON.stringify(episodeNosBefore)}`,
  );

  let run: RunResult;
  try {
    console.error("[run] generating exactly one episode...");
    const t0 = Date.now();
    run = await runOnceCli({
      novelId,
      maxTiktaka,
      storyTimeStepMinutes,
      startStoryTimeIso,
    });
    console.error(`[run] finished in ${Date.now() - t0}ms`);
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`[run] cli crashed (no JSON): ${detail}`);
    throw err;
  }

  const first = run.results?.[0];
  const status = first?.status;
  const episodeNo = first?.episode_no;
  const issues = first?.issues;

  if (!run.ok || status !== "ok" || typeof episodeNo !== "number") {
    // When a generation attempt fails due to review/quality, we often want to restart from episode 1.
    // This option deletes ALL novel-scoped data (including episode 1) so the next run can start clean.
    if (cleanOnFailure && status === "review_failed") {
      console.error(
        "[chain] cleanOnFailure=true & status=review_failed: deleting novel data except novels...",
      );
      await deleteNovelDataExceptNovels({ supabase, novelId });
    }

    if (issues) {
      const serialized = (() => {
        try {
          return JSON.stringify(issues);
        } catch {
          return String(issues);
        }
      })();
      console.error(`[run] failure issues (truncated): ${serialized.slice(0, 2000)}`);
    }

    throw new AgentError({
      type: "UNEXPECTED_ERROR",
      code: "UNKNOWN",
      message: "Episode generation failed",
      details: { novelId, ok: run.ok, status, episodeNo },
    });
  }

  const episodeNosAfter = await getEpisodeNos({ supabase, novelId });
  const expected = Array.from({ length: episodeNosAfter.length }, (_v, i) => i + 1);
  const contiguous = episodeNosAfter.every((n, idx) => n === expected[idx]);

  const counts = {
    episodes: await countByNovelId({
      supabase,
      table: "episodes",
      novelId,
    }),
    episode_chunks: await countByNovelId({
      supabase,
      table: "episode_chunks",
      novelId,
    }),
    characters: await countByNovelId({
      supabase,
      table: "characters",
      novelId,
    }),
    locations: await countByNovelId({
      supabase,
      table: "locations",
      novelId,
    }),
    plot_seeds: await countByNovelId({
      supabase,
      table: "plot_seeds",
      novelId,
    }),
    ...(await countPlotSeedJoins({ supabase, novelId })),
  };

  console.info(
    JSON.stringify(
      {
        ok: true,
        novel: { id: novelRow.id, title: novelRow.title },
        created_episode_no: episodeNo,
        episode_nos_before: episodeNosBefore,
        episode_nos_after: episodeNosAfter,
        contiguous,
        maxTiktaka,
        counts,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
