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
import { writeDbTools } from './mcp/db-write/tools';

const zGenerateChapterInput = z.object({
  currentTime: z.string().min(1),
});

type FinalizeResult = {
  episode: { id: string; content: string; summary: string };
  characters: Array<Record<string, unknown>>;
  places: Array<Record<string, unknown>>;
};

const buildInitialContext = (chapterId: string): ChapterContext => ({
  id: chapterId,
  previousStory: '',
  references: {
    characters: [],
    places: [],
  },
  content: '',
  summary: '',
});

const isDuplicateError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes('duplicate') || message.includes('already exists');
};

const callWriteTool = async (
  chapterId: string,
  toolName: string,
  args: unknown,
): Promise<Record<string, unknown>> => {
  console.info(`[${chapterId}] Calling ${toolName}`);

  const tool = writeDbTools.find((candidate) => candidate.name === toolName);

  if (!tool) {
    throw new Error(`write-db tool ${toolName} not found`);
  }

  try {
    const result = await tool.handler(args);

    console.info(`[${chapterId}] Completed ${toolName}`);

    return result as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to call write tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown'}`,
    );
  }
};

const saveToDatabase = async (
  chapterId: string,
  finalizeResult: FinalizeResult,
): Promise<void> => {
  await callWriteTool(chapterId, 'episodes.create', {
    id: finalizeResult.episode.id,
    content: finalizeResult.episode.content,
    summary: finalizeResult.episode.summary,
    characters: finalizeResult.characters.map((c) => c.name).filter(Boolean),
    places: finalizeResult.places.map((p) => p.name).filter(Boolean),
  });

  for (const place of finalizeResult.places) {
    try {
      await callWriteTool(chapterId, 'places.create', place);
    } catch (error) {
      if (isDuplicateError(error)) {
        await callWriteTool(chapterId, 'places.update', place);
      } else {
        throw error;
      }
    }
  }

  for (const character of finalizeResult.characters) {
    try {
      await callWriteTool(chapterId, 'characters.create', character);
    } catch (error) {
      if (isDuplicateError(error)) {
        await callWriteTool(chapterId, 'characters.update', character);
      } else {
        throw error;
      }
    }
  }
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
