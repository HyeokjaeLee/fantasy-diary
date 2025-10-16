import {
  postEscapeFromSeoulCharacters,
  postEscapeFromSeoulEpisodes,
  postEscapeFromSeoulPlaces,
} from '@supabase-api/sdk.gen';
import { z } from 'zod';

import { publicProcedure } from '@/configs/trpc/settings';
import { devConsole } from '@/utils/dev-console';

import { getMcpFunctionDeclarations } from './_lib/mcp-client';
import { NovelWritingAgent } from './_lib/novel-agent';
import type {
  ChapterContext,
  WriteChapterRequest,
  WriteChapterResponse,
} from './_types/novel';
import { configureSupabaseRest } from './mcp/_libs/configure-supabase';

const zGenerateChapterInput = z.object({
  currentTime: z.string().min(1),
});

const zPlace = z.object({
  name: z.string(),
  current_situation: z.string().default(''),
  latitude: z.number().default(0),
  longitude: z.number().default(0),
  last_weather_condition: z.string().default(''),
  last_weather_weather_condition: z.string().default(''),
  last_mentioned_episode_id: z.string().default(''),
});

const zCharacter = z.object({
  name: z.string(),
  personality: z.string().default(''),
  background: z.string().default(''),
  appearance: z.string().default(''),
  current_place: z.string().default(''),
  relationships: z.unknown().default({}),
  major_events: z.array(z.string()).default([]),
  character_traits: z.array(z.string()).default([]),
  current_status: z.string().default(''),
  last_mentioned_episode_id: z.string().default(''),
});

type FinalizeResult = {
  episode: { id: string; content: string; summary: string };
  characters: Array<Record<string, unknown>>;
  places: Array<Record<string, unknown>>;
};

const buildInitialContext = (chapterId: string): ChapterContext => ({
  id: chapterId,
  previousStory: '',
  characters: {
    new: [],
    updated: [],
  },
  places: {
    new: [],
    updated: [],
  },
  content: '',
  summary: '',
});

const saveToDatabase = async (
  chapterId: string,
  finalizeResult: FinalizeResult,
): Promise<void> => {
  configureSupabaseRest();

  // 에피소드 생성
  const characterNames = [
    ...finalizeResult.characters.map((c) => String(c.name)),
  ].filter(Boolean);
  const placeNames = [
    ...finalizeResult.places.map((p) => String(p.name)),
  ].filter(Boolean);

  const { error: episodeError } = await postEscapeFromSeoulEpisodes({
    headers: { Prefer: 'return=representation' },
    query: { select: '*' },
    body: {
      id: finalizeResult.episode.id,
      content: finalizeResult.episode.content,
      summary: finalizeResult.episode.summary,
      characters: characterNames as string[],
      places: placeNames as string[],
    },
  });

  if (episodeError) {
    throw new Error(
      `Failed to create episode: ${JSON.stringify(episodeError)}`,
    );
  }

  // 새로운 장소 생성
  for (const place of finalizeResult.places) {
    const validatedPlace = zPlace.parse(place);

    const { error } = await postEscapeFromSeoulPlaces({
      headers: { Prefer: 'return=representation' },
      query: { select: '*' },
      body: {
        ...validatedPlace,
        updated_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw new Error(`Failed to create place: ${JSON.stringify(error)}`);
    }
  }

  // 업데이트된 장소 수정 (별도로 처리됨)

  // 새로운 캐릭터 생성
  for (const character of finalizeResult.characters) {
    const validatedCharacter = zCharacter.parse(character);

    const { error } = await postEscapeFromSeoulCharacters({
      headers: { Prefer: 'return=representation' },
      query: { select: '*' },
      body: {
        ...validatedCharacter,
        updated_at: new Date().toISOString(),
      },
    });

    if (error) {
      throw new Error(`Failed to create character: ${JSON.stringify(error)}`);
    }
  }

  // 업데이트된 캐릭터 수정 (별도로 처리됨)
};

const formatChapterId = (dateTime: string): string => {
  // ISO 8601 형식으로 변환 (DB의 timestamp 타입과 호환)
  const date = new Date(dateTime);

  return date.toISOString();
};

const generateEscapeFromSeoulChapter = async (
  request: WriteChapterRequest,
): Promise<WriteChapterResponse> => {
  const startTime = Date.now();

  try {
    const chapterId = formatChapterId(request.currentTime);
    devConsole(`[${chapterId}] Starting chapter generation...`);

    const context = buildInitialContext(chapterId);

    devConsole(`[${chapterId}] Loading MCP tools...`);
    const tools = await getMcpFunctionDeclarations();
    devConsole(`[${chapterId}] Loaded ${tools.length} tools`);

    const agent = new NovelWritingAgent(context, tools);

    devConsole(`[${chapterId}] Phase 0: Planning...`);
    await agent.executePlanning();

    devConsole(`[${chapterId}] Phase 1: Prewriting...`);
    await agent.executePrewriting();

    devConsole(`[${chapterId}] Phase 2: Drafting...`);
    await agent.executeDrafting();

    devConsole(`[${chapterId}] Phase 3: Revision...`);
    await agent.executeRevision();

    devConsole(`[${chapterId}] Phase 4: Finalizing...`);
    const finalizeResult = await agent.executeFinalize();

    devConsole(`[${chapterId}] Saving to database...`);
    await saveToDatabase(chapterId, finalizeResult);

    const executionTime = Date.now() - startTime;

    devConsole(
      `[${chapterId}] Completed in ${(executionTime / 1000).toFixed(1)}s`,
    );

    return {
      success: true,
      chapterId,
      content: context.content,
      stats: {
        wordCount: context.content.length,
        charactersAdded: finalizeResult.characters.length,
        placesAdded: finalizeResult.places.length,
        executionTime,
      },
    };
  } catch (error) {
    console.error('Error generating chapter:', error);

    return {
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
    };
  }
};

export const escapeFromSeoulEpisode = publicProcedure
  .input(zGenerateChapterInput)
  .mutation(async ({ input }) => generateEscapeFromSeoulChapter(input));
