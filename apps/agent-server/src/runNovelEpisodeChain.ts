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

async function runOnceCli(params: {
  novelId: string;
  maxTiktaka: number;
  storyTimeStepMinutes: number;
  startStoryTimeIso?: string;
}): Promise<RunResult> {
  const { novelId, maxTiktaka, storyTimeStepMinutes, startStoryTimeIso } = params;

  const args: string[] = [
    "bun",
    "src/index.ts",
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

  const targetEpisodes = toPositiveInt(args.targetEpisodes, 5);
  const maxTiktaka = toPositiveInt(args.maxTiktaka, 2);
  const maxRestarts = toPositiveInt(args.maxRestarts, 5);
  const cleanStart = toBoolean(args.cleanStart, false);
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

  if (cleanStart) {
    console.error("[chain] cleanStart=true: deleting novel data except novels...");
    await deleteNovelDataExceptNovels({ supabase, novelId });
  }

  for (let restart = 0; restart <= maxRestarts; restart++) {
    const episodeNosBefore = await getEpisodeNos({ supabase, novelId });

    // 처음부터 시작해야 하는 시나리오에서는 0이어야 정상. (미리 존재하면 사용자 지시대로 삭제해도 되지만,
    // 여기서는 실패 시에만 정리하도록 하고, 기존 에피소드가 있으면 '추가 생성'로 취급한다.)
    let progress = episodeNosBefore.length;

    console.error(
      `[chain] restart=${restart}/${maxRestarts} start progress=${progress}/${targetEpisodes} existing=${JSON.stringify(
        episodeNosBefore,
      )}`,
    );

    while (progress < targetEpisodes) {
      let run: RunResult;
      try {
        console.error(
          `[chain] restart=${restart} running next (progress=${progress}/${targetEpisodes})...`,
        );
        const t0 = Date.now();
        run = await runOnceCli({
          novelId,
          maxTiktaka,
          storyTimeStepMinutes,
          startStoryTimeIso,
        });
        console.error(
          `[chain] restart=${restart} finished in ${Date.now() - t0}ms`,
        );
      } catch {
        // 실패(예: 모델/파서 예외로 프로세스가 JSON 없이 종료)도 동일하게 롤백 후 재시작.
        console.error(
          `[chain] restart=${restart} cli crashed (no JSON). cleaning up and restarting from ep1...`,
        );
        await deleteNovelDataExceptNovels({ supabase, novelId });
        progress = 0;
        break;
      }

      const first = run.results?.[0];
      const status = first?.status;
      const episodeNo = first?.episode_no;
      const issues = first?.issues;

      if (!run.ok || status !== "ok" || typeof episodeNo !== "number") {
        // 실패 규칙: novels 제외 전부 삭제 후 1편부터 다시 생성
        console.error(
          `[chain] restart=${restart} run failed: ok=${String(run.ok)} status=${String(
            status,
          )} episodeNo=${String(episodeNo)}. cleaning up and restarting from ep1...`,
        );

        if (issues) {
          const serialized = (() => {
            try {
              return JSON.stringify(issues);
            } catch {
              return String(issues);
            }
          })();
          console.error(
            `[chain] failure issues (truncated): ${serialized.slice(0, 2000)}`,
          );
        }

        await deleteNovelDataExceptNovels({ supabase, novelId });
        progress = 0;
        break;
      }

      progress++;

      console.error(
        `[chain] restart=${restart} persisted episode_no=${episodeNo} (progress=${progress}/${targetEpisodes})`,
      );
    }

    if (progress >= targetEpisodes) {
      const episodeNos = await getEpisodeNos({ supabase, novelId });
      const ok = episodeNos.length >= targetEpisodes;
      if (!ok)
        throw new AgentError({
          type: "UNEXPECTED_ERROR",
          code: "UNKNOWN",
          message: "Expected episodes were not persisted",
          details: { novelId, episodeNos },
        });

      console.info(
        JSON.stringify(
          {
            ok: true,
            novel: { id: novelRow.id, title: novelRow.title },
            targetEpisodes,
            episode_nos: episodeNos,
            maxTiktaka,
            restarts: restart,
          },
          null,
          2,
        ),
      );
      return;
    }
  }

  throw new AgentError({
    type: "UNEXPECTED_ERROR",
    code: "UNKNOWN",
    message: "Failed to generate target episodes within restart budget",
    details: { novelId, targetEpisodes, maxRestarts },
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
