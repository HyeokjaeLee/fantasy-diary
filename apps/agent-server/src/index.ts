import type { Json, Tables } from "@fantasy-diary/shared/supabase";

type ArgMap = Record<string, string | boolean>;

type EnrichedPlotSeed = Tables<"plot_seeds"> & {
  related_characters: Array<{ id: string; name: string }>;
  related_locations: Array<{ id: string; name: string }>;
};

type GenerateResult = {
  episode_content: string;
  next_context: Json;
  resolved_plot_seed_ids?: string[];
};

function parseArgs(argv: string[]): { args: ArgMap; positionals: string[] } {
  const args: ArgMap = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);

    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      args[key] = rest.join("=");
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      i++;
      continue;
    }

    args[withoutPrefix] = true;
  }

  return { args, positionals };
}

function requireEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);

  return value;
}

function withTrailingSlashRemoved(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toBoolean(
  value: string | boolean | undefined,
  defaultValue: boolean
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  return defaultValue;
}

function extractFirstJsonObject(text: string): unknown {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first)
    throw new Error("Model did not return JSON");
  const candidate = text.slice(first, last + 1).trim();

  return JSON.parse(candidate);
}

function assertGenerateResult(value: unknown): GenerateResult {
  if (!value || typeof value !== "object")
    throw new Error("Invalid model result (not an object)");

  const record = value as Record<string, unknown>;
  if (
    typeof record.episode_content !== "string" ||
    record.episode_content.length === 0
  ) {
    throw new Error("Invalid model result: episode_content is required");
  }

  if (record.next_context === undefined) {
    throw new Error("Invalid model result: next_context is required");
  }

  if (record.resolved_plot_seed_ids !== undefined) {
    if (!Array.isArray(record.resolved_plot_seed_ids)) {
      throw new Error(
        "Invalid model result: resolved_plot_seed_ids must be an array"
      );
    }
    for (const id of record.resolved_plot_seed_ids) {
      if (typeof id !== "string")
        throw new Error(
          "Invalid model result: resolved_plot_seed_ids must be string[]"
        );
    }
  }

  return record as GenerateResult;
}

async function geminiGenerateText(params: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<string> {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent`
  );
  url.searchParams.set("key", params.apiKey);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
      },
    }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message = json?.error?.message ?? res.statusText;
    throw new Error(`Gemini API error: ${res.status} ${message}`);
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0)
    throw new Error("Gemini API returned empty content");

  const text = parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("\n")
    .trim();

  if (!text) throw new Error("Gemini API returned no text");

  return text;
}

function createSupabaseRestClient(params: {
  url: string;
  serviceRoleKey: string;
}) {
  const baseUrl = withTrailingSlashRemoved(params.url);

  async function request(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("apikey", params.serviceRoleKey);
    headers.set("authorization", `Bearer ${params.serviceRoleKey}`);

    const hasBody = init.body !== undefined && init.body !== null;
    if (hasBody && !headers.has("content-type"))
      headers.set("content-type", "application/json");

    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await request(path, init);
    const text = await res.text();

    if (!res.ok) {
      const snippet = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
      throw new Error(
        `Supabase REST error: ${res.status} ${res.statusText}: ${snippet}`
      );
    }

    if (!text) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Supabase REST returned non-JSON: ${text.slice(0, 2000)}`
      );
    }
  }

  return { json };
}

function asCsvInList(values: string[]): string {
  return values.join(",");
}

async function loadNovelData(
  client: ReturnType<typeof createSupabaseRestClient>,
  novelId: string
) {
  const [novels, characters, locations, latestContexts, openPlotSeeds] =
    await Promise.all([
      client.json<Tables<"novels">[]>(
        `/rest/v1/novels?id=eq.${encodeURIComponent(novelId)}&select=*`
      ),
      client.json<Tables<"characters">[]>(
        `/rest/v1/characters?novel_id=eq.${encodeURIComponent(novelId)}&select=*`
      ),
      client.json<Tables<"locations">[]>(
        `/rest/v1/locations?novel_id=eq.${encodeURIComponent(novelId)}&select=*`
      ),
      client.json<Tables<"story_contexts">[]>(
        `/rest/v1/story_contexts?novel_id=eq.${encodeURIComponent(novelId)}&select=*&order=created_at.desc&limit=1`
      ),
      client.json<Tables<"plot_seeds">[]>(
        `/rest/v1/plot_seeds?novel_id=eq.${encodeURIComponent(novelId)}&status=eq.open&select=*`
      ),
    ]);

  const novel = novels[0];
  if (!novel) throw new Error(`Novel not found: ${novelId}`);

  const plotSeedIds = openPlotSeeds.map((s) => s.id);

  const [plotSeedCharacters, plotSeedLocations] = await Promise.all([
    plotSeedIds.length
      ? client.json<Tables<"plot_seed_characters">[]>(
          `/rest/v1/plot_seed_characters?plot_seed_id=in.(${asCsvInList(plotSeedIds)})&select=plot_seed_id,character_id`
        )
      : Promise.resolve([] as Tables<"plot_seed_characters">[]),
    plotSeedIds.length
      ? client.json<Tables<"plot_seed_locations">[]>(
          `/rest/v1/plot_seed_locations?plot_seed_id=in.(${asCsvInList(plotSeedIds)})&select=plot_seed_id,location_id`
        )
      : Promise.resolve([] as Tables<"plot_seed_locations">[]),
  ]);

  const characterById = new Map(characters.map((c) => [c.id, c] as const));
  const locationById = new Map(locations.map((l) => [l.id, l] as const));

  const plotSeedCharacterIdsBySeedId = new Map<string, string[]>();
  for (const rel of plotSeedCharacters) {
    const list = plotSeedCharacterIdsBySeedId.get(rel.plot_seed_id) ?? [];
    list.push(rel.character_id);
    plotSeedCharacterIdsBySeedId.set(rel.plot_seed_id, list);
  }

  const plotSeedLocationIdsBySeedId = new Map<string, string[]>();
  for (const rel of plotSeedLocations) {
    const list = plotSeedLocationIdsBySeedId.get(rel.plot_seed_id) ?? [];
    list.push(rel.location_id);
    plotSeedLocationIdsBySeedId.set(rel.plot_seed_id, list);
  }

  const openPlotSeedsEnriched: EnrichedPlotSeed[] = openPlotSeeds.map((seed) => {
    const relatedCharacters = (plotSeedCharacterIdsBySeedId.get(seed.id) ?? [])
      .map((id) => characterById.get(id))
      .filter((v): v is Tables<"characters"> => Boolean(v));

    const relatedLocations = (plotSeedLocationIdsBySeedId.get(seed.id) ?? [])
      .map((id) => locationById.get(id))
      .filter((v): v is Tables<"locations"> => Boolean(v));

    return {
      ...seed,
      related_characters: relatedCharacters.map((c) => ({
        id: c.id,
        name: c.name,
      })),
      related_locations: relatedLocations.map((l) => ({
        id: l.id,
        name: l.name,
      })),
    };
  });

  return {
    novel,
    characters,
    locations,
    latestContext: latestContexts[0]?.context,
    openPlotSeeds: openPlotSeedsEnriched,
  };
}

async function getNextEpisodeNo(
  client: ReturnType<typeof createSupabaseRestClient>,
  novelId: string
): Promise<number> {
  const latest = await client.json<Array<{ episode_no: number }>>(
    `/rest/v1/episodes?novel_id=eq.${encodeURIComponent(novelId)}&select=episode_no&order=episode_no.desc&limit=1`
  );
  const last = latest[0]?.episode_no;

  return typeof last === "number" ? last + 1 : 1;
}

function buildPrompt(input: {
  novel: Tables<"novels">;
  episodeNo: number;
  latestContext: Json | null | undefined;
  characters: Tables<"characters">[];
  locations: Tables<"locations">[];
  openPlotSeeds: EnrichedPlotSeed[];
}): string {
  const payload = {
    novel: {
      id: input.novel.id,
      title: input.novel.title,
      genre: input.novel.genre,
    },
    episode_no: input.episodeNo,
    latest_context: input.latestContext ?? null,
    characters: input.characters.map((c) => ({
      id: c.id,
      name: c.name,
      profile: c.profile,
    })),
    locations: input.locations.map((l) => ({
      id: l.id,
      name: l.name,
      profile: l.profile,
    })),
    open_plot_seeds: input.openPlotSeeds,
  };

  return [
    "너는 연재 소설 작가 AI다.",
    "아래 입력(JSON)을 바탕으로 다음 회차를 한국어로 작성하라.",
    "연속성과 인물/장소 설정을 반드시 지켜라.",
    "열린(open) 떡밥은 잊지 말고 적절히 유지하거나 회수하라.",
    "결과는 반드시 JSON만 출력하라(마크다운/코드펜스 금지).",
    "반드시 아래 스키마를 지켜라:",
    '{\n  "episode_content": string,\n  "next_context": object,\n  "resolved_plot_seed_ids"?: string[]\n}',
    "- episode_content: 회차 원문 텍스트",
    "- next_context: 다음 회차 생성을 위한 구조화 컨텍스트(자유 형식 object)",
    "- resolved_plot_seed_ids: 이번 회차에서 회수한 떡밥 plot_seeds.id 목록(선택)",
    "입력(JSON):",
    JSON.stringify(payload),
  ].join("\n");
}

async function writeEpisodeAndContext(params: {
  client: ReturnType<typeof createSupabaseRestClient>;
  novelId: string;
  episodeNo: number;
  episodeContent: string;
  nextContext: Json;
  resolvedPlotSeedIds: string[];
}) {
  const insertedEpisodes = await params.client.json<Tables<"episodes">[]>(
    `/rest/v1/episodes?select=*`,
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        novel_id: params.novelId,
        episode_no: params.episodeNo,
        content: params.episodeContent,
      }),
    }
  );

  const episode = insertedEpisodes[0];
  if (!episode) throw new Error("Failed to insert episode");

  await params.client.json<unknown>(`/rest/v1/story_contexts`, {
    method: "POST",
    body: JSON.stringify({
      novel_id: params.novelId,
      context: params.nextContext,
    }),
  });

  if (params.resolvedPlotSeedIds.length > 0) {
    await params.client.json<unknown>(
      `/rest/v1/plot_seeds?id=in.(${asCsvInList(params.resolvedPlotSeedIds)})&novel_id=eq.${encodeURIComponent(params.novelId)}`, 
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "resolved",
          resolved_in_episode_id: episode.id,
        }),
      }
    );
  }

  return { episode };
}

async function main(): Promise<void> {
  const { args } = parseArgs(Bun.argv.slice(2));

  const kind = typeof args.kind === "string" ? args.kind : "daily";
  const novelId = typeof args.novelId === "string" ? args.novelId : undefined;
  const dryRun = toBoolean(args.dryRun, false);

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const geminiApiKey = requireEnv("GEMINI_API_KEY");
  const geminiModel =
    typeof Bun.env.GEMINI_MODEL === "string"
      ? Bun.env.GEMINI_MODEL
      : "gemini-1.5-pro";

  const client = createSupabaseRestClient({
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
  });

  const targetNovelIds: string[] = [];

  if (novelId) {
    targetNovelIds.push(novelId);
  } else if (kind === "daily") {
    const novels = await client.json<Tables<"novels">[]>(
      `/rest/v1/novels?status=eq.active&select=*`
    );
    targetNovelIds.push(...novels.map((n) => n.id));
  } else {
    throw new Error("Either --novelId must be provided or --kind=daily");
  }

  const results: Array<{
    novel_id: string;
    episode_no: number;
    dry_run: boolean;
    episode_id?: string;
  }> = [];

  for (const targetNovelId of targetNovelIds) {
    const episodeNo =
      typeof args.episodeNo === "string" && args.episodeNo.trim().length > 0
        ? Number(args.episodeNo)
        : await getNextEpisodeNo(client, targetNovelId);

    if (!Number.isInteger(episodeNo) || episodeNo <= 0)
      throw new Error(`Invalid --episodeNo: ${args.episodeNo}`);

    const { novel, characters, locations, latestContext, openPlotSeeds } =
      await loadNovelData(client, targetNovelId);

    const prompt = buildPrompt({
      novel,
      episodeNo,
      latestContext,
      characters,
      locations,
      openPlotSeeds,
    });

    const modelText = await geminiGenerateText({
      apiKey: geminiApiKey,
      model: geminiModel,
      prompt,
    });

    const parsed = assertGenerateResult(extractFirstJsonObject(modelText));

    const resolvedPlotSeedIds = Array.isArray(parsed.resolved_plot_seed_ids)
      ? parsed.resolved_plot_seed_ids
      : [];

    if (dryRun) {
      results.push({
        novel_id: targetNovelId,
        episode_no: episodeNo,
        dry_run: true,
      });
      continue;
    }

    const { episode } = await writeEpisodeAndContext({
      client,
      novelId: targetNovelId,
      episodeNo,
      episodeContent: parsed.episode_content,
      nextContext: parsed.next_context,
      resolvedPlotSeedIds,
    });

    results.push({
      novel_id: targetNovelId,
      episode_no: episodeNo,
      dry_run: false,
      episode_id: episode.id,
    });
  }

  console.log(
    JSON.stringify({
      ok: true,
      job: "agent-server",
      kind,
      dry_run: dryRun,
      results,
      now: new Date().toISOString(),
    })
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
