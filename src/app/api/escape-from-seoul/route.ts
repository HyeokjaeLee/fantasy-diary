import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEpisodes,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ENV } from '@/env';

import { getMcpFunctionDeclarations } from './lib/mcp-client';
import { NovelWritingAgent } from './lib/novel-agent';
import type {
  ChapterContext,
  CharacterDraft,
  PlaceDraft,
  WriteChapterRequest,
  WriteChapterResponse,
} from './types/novel';

// Vercel timeout setting (max 300s)
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
): Promise<NextResponse<WriteChapterResponse>> {
  const startTime = Date.now();

  try {
    // 1. Parse request
    const body: WriteChapterRequest = await req.json();
    const currentTime = new Date(body.currentTime);

    if (isNaN(currentTime.getTime())) {
      return NextResponse.json(
        {
          success: false,
          chapterId: '',
          content: '',
          stats: {
            wordCount: 0,
            charactersAdded: 0,
            placesAdded: 0,
            executionTime: 0,
          },
          error: 'Invalid currentTime format',
        },
        { status: 400 },
      );
    }

    // 2. Generate chapter ID (YYYYMMDDHHmm)
    const chapterId = formatChapterId(currentTime);

    console.info(`[${chapterId}] Starting chapter generation...`);

    // 3. Fetch previous chapter
    const previousChapter = await getPreviousChapter();

    // 4. Initialize ChapterContext
    const context: ChapterContext = {
      chapterId,
      currentTime,
      previousChapter,
      references: {
        characters: [],
        places: [],
      },
      draft: {
        characters: [],
        places: [],
      },
    };

    // 5. Convert MCP Tools to Gemini Function Declarations
    console.info(`[${chapterId}] Loading MCP tools...`);
    const tools = await getMcpFunctionDeclarations();
    console.info(`[${chapterId}] Loaded ${tools.length} tools`);

    // 6. Create Novel Agent
    const agent = new NovelWritingAgent(context, tools);

    // 7. Phase 1: Prewriting
    console.info(`[${chapterId}] Phase 1: Prewriting...`);
    await agent.executePrewriting();

    // 8. Phase 2: Drafting
    console.info(`[${chapterId}] Phase 2: Drafting...`);
    await agent.executeDrafting();

    // 9. Phase 3: Revision
    console.info(`[${chapterId}] Phase 3: Revision...`);
    const revisionResult = await agent.executeRevision();
    const finalContent = revisionResult.output;

    console.info(`[${chapterId}] Reconciling entities...`);
    await agent.reconcileEntities();

    // 10. Save to database
    console.info(`[${chapterId}] Saving to database...`);
    await saveChapterToDb(chapterId, finalContent, context);

    // 11. Calculate execution time
    const executionTime = Date.now() - startTime;

    console.info(
      `[${chapterId}] Completed in ${(executionTime / 1000).toFixed(1)}s`,
    );

    // 12. Return response
    return NextResponse.json({
      success: true,
      chapterId,
      content: finalContent,
      stats: {
        wordCount: finalContent.length,
        charactersAdded: context.draft.characters.length,
        placesAdded: context.draft.places.length,
        executionTime,
      },
    });
  } catch (error) {
    console.error('Error generating chapter:', error);

    return NextResponse.json(
      {
        success: false,
        chapterId: '',
        content: '',
        stats: {
          wordCount: 0,
          charactersAdded: 0,
          placesAdded: 0,
          executionTime: Date.now() - startTime,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// Helper: Format chapter ID (YYYYMMDDHHmm)
function formatChapterId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}${month}${day}${hour}${minute}`;
}

// Helper: Fetch previous chapter
async function getPreviousChapter(): Promise<
  EscapeFromSeoulEpisodes | undefined
> {
  try {
    const baseUrl = ENV.NEXT_PUBLIC_URL;
    const url = `${baseUrl}/api/escape-from-seoul/mcp/read-db`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'episodes.list',
          arguments: { limit: 1 },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Error fetching previous chapter: ${response.status} ${response.statusText} - ${errorText}`,
      );

      return undefined;
    }

    const result = await response.json();
    if (result.error) {
      console.error(
        `Error fetching previous chapter: ${result.error.message ?? 'Unknown error'}`,
      );

      return undefined;
    }
    const episodesText = result.result?.content?.[0]?.text;

    if (!episodesText) return undefined;

    const episodes = JSON.parse(episodesText) as EscapeFromSeoulEpisodes[];

    return Array.isArray(episodes) ? episodes[0] || undefined : undefined;
  } catch (error) {
    console.error('Error fetching previous chapter:', error);

    return undefined;
  }
}

// Helper: Save chapter to database
async function saveChapterToDb(
  id: string,
  content: string,
  context: ChapterContext,
) {
  const baseUrl = ENV.NEXT_PUBLIC_URL || 'http://localhost:3000';
  const writeDbUrl = `${baseUrl}/api/escape-from-seoul/mcp/write-db`;
  const readDbUrl = `${baseUrl}/api/escape-from-seoul/mcp/read-db`;
  const debug = (message: string) =>
    console.info(`[${context.chapterId}] ${message}`);
  const preview = (value: unknown, maxLength = 160) => {
    if (value === undefined || value === null) return '(empty)';
    let text: string;
    if (typeof value === 'string') {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    }
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;

    return `${normalized.slice(0, maxLength)}...`;
  };
  const callRpcTool = async (
    url: string,
    mode: 'read' | 'write',
    toolName: string,
    args: unknown,
  ) => {
    const action = mode === 'write' ? 'Calling' : 'Reading';
    debug(`${action} ${toolName} with args ${preview(args, 120)}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed ${toolName} request (${mode}): ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(
        `MCP ${toolName} error (${mode}): ${
          payload.error.message ?? 'Unknown error'
        }`,
      );
    }

    const resultText = payload.result?.content?.[0]?.text ?? '';
    let parsedResult: unknown = resultText;
    if (typeof resultText === 'string' && resultText.length > 0) {
      try {
        parsedResult = JSON.parse(resultText);
      } catch {
        parsedResult = resultText;
      }
    }

    const completionLabel = mode === 'write' ? 'Completed' : 'Read';
    debug(`${completionLabel} ${toolName} -> ${preview(parsedResult, 120)}`);

    return parsedResult;
  };
  const callWriteTool = async (toolName: string, args: unknown) =>
    callRpcTool(writeDbUrl, 'write', toolName, args);
  const callReadTool = async (toolName: string, args: unknown) =>
    callRpcTool(readDbUrl, 'read', toolName, args);
  const toRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  };
  const normalizeArray = <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [];
  const valuesDiffer = (left: unknown, right: unknown) =>
    JSON.stringify(left) !== JSON.stringify(right);
  const normalizeName = (value: unknown) =>
    typeof value === 'string' ? value.trim() : undefined;

  // 1. Save episode
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    throw new Error('Cannot save empty chapter content');
  }
  const summaryText = trimmedContent.replace(/\s+/g, ' ').slice(0, 280);
  const characterNames = Array.from(
    new Set(
      context.draft.characters
        .map((character) => normalizeName(character.name))
        .filter((name): name is string => !!name),
    ),
  );
  if (characterNames.length === 0) {
    debug('No characters tracked in draft; falling back to reference snapshot');
    for (const character of context.references.characters) {
      const resolved = normalizeName(character.name);
      if (resolved) {
        characterNames.push(resolved);
      }
    }
  }
  const placeNames = Array.from(
    new Set(
      context.draft.places
        .map((place) => normalizeName(place.name))
        .filter((name): name is string => !!name),
    ),
  );
  if (placeNames.length === 0) {
    debug('No places tracked in draft; falling back to reference snapshot');
    for (const place of context.references.places) {
      const resolved = normalizeName(place.name);
      if (resolved) {
        placeNames.push(resolved);
      }
    }
  }
  const episodeArgs = {
    id,
    content,
    summary: summaryText.length > 0 ? summaryText : undefined,
    characters: characterNames,
    places: placeNames,
  };
  await callWriteTool('episodes.create', episodeArgs);

  // 2. Load latest reference data for consistency checks
  const charactersSnapshot = normalizeArray<EscapeFromSeoulCharacters>(
    await callReadTool('characters.list', { limit: 100 }),
  );
  const placesSnapshot = normalizeArray<EscapeFromSeoulPlaces>(
    await callReadTool('places.list', { limit: 100 }),
  );
  context.references.characters = charactersSnapshot;
  context.references.places = placesSnapshot;

  const characterColumns: Array<keyof EscapeFromSeoulCharacters> = [
    'name',
    'personality',
    'background',
    'appearance',
    'current_place',
    'relationships',
    'major_events',
    'character_traits',
    'current_status',
    'updated_at',
    'last_mentioned_episode_id',
  ];
  const placeColumns: Array<keyof EscapeFromSeoulPlaces> = [
    'name',
    'current_situation',
    'latitude',
    'longitude',
    'last_weather_condition',
    'last_weather_weather_condition',
    'updated_at',
    'last_mentioned_episode_id',
  ];

  const characterByName = new Map<string, EscapeFromSeoulCharacters>();
  for (const character of charactersSnapshot) {
    const key = normalizeName(character.name);
    if (key) {
      characterByName.set(key, character);
    }
  }

  const placeByName = new Map<string, EscapeFromSeoulPlaces>();
  for (const place of placesSnapshot) {
    const key = normalizeName(place.name);
    if (key) {
      placeByName.set(key, place);
    }
  }

  const setCharacterCache = (record: EscapeFromSeoulCharacters) => {
    const key = normalizeName(record.name);
    if (key) {
      characterByName.set(key, record);
    }
  };

  const setPlaceCache = (record: EscapeFromSeoulPlaces) => {
    const key = normalizeName(record.name);
    if (key) {
      placeByName.set(key, record);
    }
  };

  const fetchCharacter = async (
    name: string,
  ): Promise<EscapeFromSeoulCharacters | undefined> => {
    const normalized = normalizeName(name);
    if (!normalized) {
      return undefined;
    }
    if (characterByName.has(normalized)) {
      return characterByName.get(normalized);
    }
    const result = toRecord(
      await callReadTool('characters.get', { name: normalized }),
    );
    if (result && typeof result.name === 'string') {
      const cast = result as EscapeFromSeoulCharacters;
      setCharacterCache(cast);

      return cast;
    }

    return undefined;
  };

  const fetchPlace = async (
    name: string,
  ): Promise<EscapeFromSeoulPlaces | undefined> => {
    const normalized = normalizeName(name);
    if (!normalized) {
      return undefined;
    }
    if (placeByName.has(normalized)) {
      return placeByName.get(normalized);
    }
    const result = toRecord(
      await callReadTool('places.get', { name: normalized }),
    );
    if (result && typeof result.name === 'string') {
      const cast = result as EscapeFromSeoulPlaces;
      setPlaceCache(cast);

      return cast;
    }

    return undefined;
  };

  const upsertPlace = async (place: PlaceDraft) => {
    const trimmedName = normalizeName(place.name);
    if (!trimmedName) {
      debug('Skip places.create because name is missing');

      return;
    }

    const payload: Record<string, unknown> = { name: trimmedName };
    for (const key of placeColumns) {
      if (key === 'name') continue;
      const value = place[key];
      if (value !== undefined) {
        payload[key] = value as never;
      }
    }
    payload.updated_at =
      (payload.updated_at as string | undefined) ??
      context.currentTime.toISOString();
    payload.last_mentioned_episode_id =
      (payload.last_mentioned_episode_id as string | undefined) ?? id;

    const existing = await fetchPlace(trimmedName);

    if (!existing) {
      const created = await callWriteTool('places.create', payload);
      const recordArray = normalizeArray<Record<string, unknown>>(created);
      const createdRecord =
        recordArray[0] ?? toRecord(created ?? null) ?? undefined;
      if (createdRecord && typeof createdRecord.name === 'string') {
        const cast = createdRecord as EscapeFromSeoulPlaces;
        setPlaceCache(cast);
        if (
          !context.references.places.some(
            (item) => normalizeName(item.name) === trimmedName,
          )
        ) {
          context.references.places.push(cast);
        }
      }

      return;
    }

    const diff: Record<string, unknown> = {};
    for (const key of placeColumns) {
      if (key === 'name') continue;
      const nextValue = payload[key];
      if (nextValue === undefined) continue;
      if (valuesDiffer((existing as Record<string, unknown>)[key], nextValue)) {
        diff[key] = nextValue;
      }
    }

    if (Object.keys(diff).length === 0) {
      return;
    }

    const updatePayload = {
      name: trimmedName,
      ...diff,
    };
    await callWriteTool('places.update', updatePayload);
    const merged = {
      ...existing,
      ...updatePayload,
    } as EscapeFromSeoulPlaces;
    setPlaceCache(merged);
    const refIndex = context.references.places.findIndex(
      (item) => normalizeName(item.name) === trimmedName,
    );
    if (refIndex >= 0) {
      context.references.places[refIndex] = merged;
    } else {
      context.references.places.push(merged);
    }
  };

  const upsertCharacter = async (char: CharacterDraft) => {
    const trimmedName = normalizeName(char.name);
    if (!trimmedName) {
      debug('Skip characters.create because name is missing');

      return;
    }

    const existing = await fetchCharacter(trimmedName);
    const payload: Record<string, unknown> = { name: trimmedName };
    for (const key of characterColumns) {
      if (key === 'name') continue;
      const value = char[key];
      if (value !== undefined) {
        payload[key] = value as never;
      }
    }
    payload.updated_at =
      (payload.updated_at as string | undefined) ??
      context.currentTime.toISOString();
    payload.last_mentioned_episode_id =
      (payload.last_mentioned_episode_id as string | undefined) ?? id;
    if (!payload.current_place) {
      const fallbackPlace =
        normalizeName(char.current_place) ??
        placeNames[0] ??
        (existing ? normalizeName(existing.current_place) : undefined) ??
        'unknown';
      if (fallbackPlace) {
        const normalizedFallback = fallbackPlace;
        if (!placeByName.has(normalizedFallback)) {
          await upsertPlace({ name: normalizedFallback });
        }
        payload.current_place = normalizedFallback;
      }
    }

    if (!existing) {
      const created = await callWriteTool('characters.create', payload);
      const recordArray = normalizeArray<Record<string, unknown>>(created);
      const createdRecord =
        recordArray[0] ?? toRecord(created ?? null) ?? undefined;
      if (createdRecord && typeof createdRecord.name === 'string') {
        const cast = createdRecord as EscapeFromSeoulCharacters;
        setCharacterCache(cast);
        if (
          !context.references.characters.some(
            (item) => normalizeName(item.name) === trimmedName,
          )
        ) {
          context.references.characters.push(cast);
        }
      }

      return;
    }

    const diff: Record<string, unknown> = {};
    for (const key of characterColumns) {
      if (key === 'name') continue;
      const nextValue = payload[key];
      if (nextValue === undefined) continue;
      if (valuesDiffer((existing as Record<string, unknown>)[key], nextValue)) {
        diff[key] = nextValue;
      }
    }

    if (Object.keys(diff).length === 0) {
      return;
    }

    const updatePayload = {
      name: trimmedName,
      ...diff,
    };
    await callWriteTool('characters.update', updatePayload);
    const merged = {
      ...existing,
      ...updatePayload,
    } as EscapeFromSeoulCharacters;
    setCharacterCache(merged);
    const refIndex = context.references.characters.findIndex(
      (item) => normalizeName(item.name) === trimmedName,
    );
    if (refIndex >= 0) {
      context.references.characters[refIndex] = merged;
    } else {
      context.references.characters.push(merged);
    }
  };

  // 3. Sync places first to satisfy character dependencies
  for (const place of context.draft.places) {
    if (!normalizeName(place.name)) continue;
    await upsertPlace(place);
  }

  // 4. Sync characters
  for (const char of context.draft.characters) {
    if (!normalizeName(char.name)) continue;
    await upsertCharacter(char);
  }
}
