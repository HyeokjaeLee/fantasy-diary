import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ENV } from '@/env';

import { getMcpFunctionDeclarations } from './lib/mcp-client';
import { NovelWritingAgent } from './lib/novel-agent';
import type {
  ChapterContext,
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
async function getPreviousChapter() {
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
          name: 'entries.list',
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
    const entriesText = result.result?.content?.[0]?.text;

    if (!entriesText) return undefined;

    const entries = JSON.parse(entriesText);

    return entries[0] || undefined;
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

  // 1. Save entry
  const trimmedContent = content.trim();
  const summary = trimmedContent.replace(/\s+/g, ' ').slice(0, 280);
  const weatherSnapshot =
    context.weather &&
    typeof context.weather.data === 'object' &&
    context.weather.data !== null &&
    !Array.isArray(context.weather.data)
      ? (context.weather.data as Record<string, unknown>)
      : null;
  if (!weatherSnapshot) {
    throw new Error(
      'Missing weather snapshot. Execute weather.openMeteo.lookup before saving the chapter.',
    );
  }
  const primaryLocationCandidate =
    context.draft.places[0]?.name ?? context.references.places[0]?.name ?? '';
  const primaryLocation =
    typeof primaryLocationCandidate === 'string'
      ? primaryLocationCandidate
      : '';
  const appearedCharacters = context.draft.characters
    .map((character) =>
      typeof character.name === 'string' ? character.name.trim() : '',
    )
    .filter((name): name is string => name.length > 0);
  const storyTagsSet = new Set<string>([`chapter:${id}`]);
  if (primaryLocation) {
    storyTagsSet.add(`location:${primaryLocation}`);
  }
  for (const name of appearedCharacters) {
    storyTagsSet.add(`character:${name}`);
  }
  const nextContext =
    typeof context.draft.prewriting === 'string'
      ? context.draft.prewriting.replace(/\s+/g, ' ').slice(0, 280)
      : '';
  const entryArgs = {
    content,
    created_at: context.currentTime.toISOString(),
    summary,
    weather: weatherSnapshot,
    location: primaryLocation || 'unknown',
    mood: 'neutral',
    major_events: [] as string[],
    appeared_characters: appearedCharacters,
    emotional_tone: 'neutral',
    story_tags: Array.from(storyTagsSet),
    previous_context: context.previousChapter?.id ?? '',
    next_context_hints: nextContext,
  };
  await callWriteTool('entries.create', entryArgs);

  // 2. Load latest reference data for consistency checks
  const charactersSnapshot = normalizeArray<EscapeFromSeoulCharacters>(
    await callReadTool('characters.list', { limit: 100 }),
  );
  const placesSnapshot = normalizeArray<EscapeFromSeoulPlaces>(
    await callReadTool('places.list', { limit: 100 }),
  );
  context.references.characters = charactersSnapshot;
  context.references.places = placesSnapshot;

  const characterById = new Map<string, EscapeFromSeoulCharacters>();
  const characterByName = new Map<string, EscapeFromSeoulCharacters>();
  for (const character of charactersSnapshot) {
    if (character.id) characterById.set(character.id, character);
    if (character.name) characterByName.set(character.name, character);
  }

  const placeById = new Map<string, EscapeFromSeoulPlaces>();
  const placeByName = new Map<string, EscapeFromSeoulPlaces>();
  for (const place of placesSnapshot) {
    if (place.id) placeById.set(place.id, place);
    if (place.name) placeByName.set(place.name, place);
  }

  const fetchCharacter = async (idOrName: {
    id?: string;
    name?: string;
  }): Promise<EscapeFromSeoulCharacters | undefined> => {
    const lookupId = idOrName.id;
    const lookupName = idOrName.name;

    if (lookupId && characterById.has(lookupId)) {
      return characterById.get(lookupId);
    }
    if (lookupName && characterByName.has(lookupName)) {
      return characterByName.get(lookupName);
    }

    if (lookupId) {
      const result = toRecord(
        await callReadTool('characters.get', { id: lookupId }),
      );
      if (
        result &&
        typeof result.id === 'string' &&
        typeof result.name === 'string'
      ) {
        const cast = result as EscapeFromSeoulCharacters;
        characterById.set(cast.id, cast);
        characterByName.set(cast.name, cast);

        return cast;
      }
    }

    if (lookupName) {
      const result = toRecord(
        await callReadTool('characters.get', { name: lookupName }),
      );
      if (
        result &&
        typeof result.id === 'string' &&
        typeof result.name === 'string'
      ) {
        const cast = result as EscapeFromSeoulCharacters;
        characterById.set(cast.id, cast);
        characterByName.set(cast.name, cast);

        return cast;
      }
    }

    return undefined;
  };

  const fetchPlace = async (idOrName: {
    id?: string;
    name?: string;
  }): Promise<EscapeFromSeoulPlaces | undefined> => {
    const lookupId = idOrName.id;
    const lookupName = idOrName.name;

    if (lookupId && placeById.has(lookupId)) {
      return placeById.get(lookupId);
    }
    if (lookupName && placeByName.has(lookupName)) {
      return placeByName.get(lookupName);
    }

    if (lookupId) {
      const result = toRecord(
        await callReadTool('places.get', { id: lookupId }),
      );
      if (
        result &&
        typeof result.id === 'string' &&
        typeof result.name === 'string'
      ) {
        const cast = result as EscapeFromSeoulPlaces;
        placeById.set(cast.id, cast);
        placeByName.set(cast.name, cast);

        return cast;
      }
    }

    if (lookupName) {
      const result = toRecord(
        await callReadTool('places.get', { name: lookupName }),
      );
      if (
        result &&
        typeof result.id === 'string' &&
        typeof result.name === 'string'
      ) {
        const cast = result as EscapeFromSeoulPlaces;
        placeById.set(cast.id, cast);
        placeByName.set(cast.name, cast);

        return cast;
      }
    }

    return undefined;
  };

  const upsertCharacter = async (char: Partial<EscapeFromSeoulCharacters>) => {
    const trimmedName = normalizeName(char.name);
    if (trimmedName) {
      char.name = trimmedName;
    }
    const lookupId = typeof char.id === 'string' ? char.id : undefined;
    const existing =
      (await fetchCharacter({
        id: lookupId ?? undefined,
        name: trimmedName,
      })) ?? undefined;

    if (!existing) {
      if (!trimmedName) {
        debug('Skip characters.create because name is missing');

        return;
      }
      const payload: Record<string, unknown> = {
        ...char,
        name: trimmedName,
      };
      const created = await callWriteTool('characters.create', payload);
      const recordArray = normalizeArray<Record<string, unknown>>(created);
      const createdRecord =
        recordArray[0] ?? toRecord(created ?? null) ?? undefined;
      if (createdRecord && typeof createdRecord.id === 'string') {
        const cast = createdRecord as EscapeFromSeoulCharacters;
        characterById.set(cast.id, cast);
        if (cast.name) {
          characterByName.set(cast.name, cast);
        }
        if (
          !context.references.characters.some((item) => item.id === cast.id)
        ) {
          context.references.characters.push(cast);
        }
        char.id = cast.id;
      }

      return;
    }

    char.id = existing.id;
    const diff: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(char)) {
      if (value === undefined) continue;
      if (valuesDiffer((existing as Record<string, unknown>)[key], value)) {
        diff[key] = value;
      }
    }

    if (Object.keys(diff).length === 0) {
      return;
    }

    const payload: Record<string, unknown> = {
      id: existing.id,
      name: (diff.name as string | undefined) ?? existing.name,
      ...diff,
    };
    await callWriteTool('characters.update', payload);
    const merged = {
      ...existing,
      ...payload,
    } as EscapeFromSeoulCharacters;
    characterById.set(merged.id, merged);
    if (merged.name) {
      characterByName.set(merged.name, merged);
    }
    const refIndex = context.references.characters.findIndex(
      (item) => item.id === merged.id,
    );
    if (refIndex >= 0) {
      context.references.characters[refIndex] = merged;
    }
  };

  const upsertPlace = async (place: Partial<EscapeFromSeoulPlaces>) => {
    const trimmedName = normalizeName(place.name);
    if (trimmedName) {
      place.name = trimmedName;
    }
    const lookupId = typeof place.id === 'string' ? place.id : undefined;
    const existing =
      (await fetchPlace({ id: lookupId ?? undefined, name: trimmedName })) ??
      undefined;

    if (!existing) {
      if (!trimmedName) {
        debug('Skip places.create because name is missing');

        return;
      }
      const payload: Record<string, unknown> = {
        ...place,
        name: trimmedName,
      };
      const created = await callWriteTool('places.create', payload);
      const recordArray = normalizeArray<Record<string, unknown>>(created);
      const createdRecord =
        recordArray[0] ?? toRecord(created ?? null) ?? undefined;
      if (createdRecord && typeof createdRecord.id === 'string') {
        const cast = createdRecord as EscapeFromSeoulPlaces;
        placeById.set(cast.id, cast);
        if (cast.name) {
          placeByName.set(cast.name, cast);
        }
        if (!context.references.places.some((item) => item.id === cast.id)) {
          context.references.places.push(cast);
        }
        place.id = cast.id;
      }

      return;
    }

    place.id = existing.id;
    const diff: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(place)) {
      if (value === undefined) continue;
      if (valuesDiffer((existing as Record<string, unknown>)[key], value)) {
        diff[key] = value;
      }
    }

    if (Object.keys(diff).length === 0) {
      return;
    }

    const payload: Record<string, unknown> = {
      id: existing.id,
      name: (diff.name as string | undefined) ?? existing.name,
      ...diff,
    };
    await callWriteTool('places.update', payload);
    const merged = {
      ...existing,
      ...payload,
    } as EscapeFromSeoulPlaces;
    placeById.set(merged.id, merged);
    if (merged.name) {
      placeByName.set(merged.name, merged);
    }
    const refIndex = context.references.places.findIndex(
      (item) => item.id === merged.id,
    );
    if (refIndex >= 0) {
      context.references.places[refIndex] = merged;
    }
  };

  // 3. Sync characters
  for (const char of context.draft.characters) {
    if (!char.name && !char.id) continue;
    await upsertCharacter(char);
  }

  // 4. Sync places
  for (const place of context.draft.places) {
    if (!place.name && !place.id) continue;
    await upsertPlace(place);
  }
}
