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

    // 3. Initialize ChapterContext
    const context: ChapterContext = {
      id: chapterId,
      previousStory: '',
      references: {
        characters: [],
        places: [],
      },
      content: '',
      summary: '',
    };

    // 4. Load MCP tools
    console.info(`[${chapterId}] Loading MCP tools...`);
    const tools = await getMcpFunctionDeclarations();
    console.info(`[${chapterId}] Loaded ${tools.length} tools`);

    // 5. Create Novel Agent
    const agent = new NovelWritingAgent(context, tools);

    // 6. Phase 0: Planning
    console.info(`[${chapterId}] Phase 0: Planning...`);
    await agent.executePlanning();

    // 7. Phase 1: Prewriting
    console.info(`[${chapterId}] Phase 1: Prewriting...`);
    await agent.executePrewriting();

    // 8. Phase 2: Drafting
    console.info(`[${chapterId}] Phase 2: Drafting...`);
    await agent.executeDrafting();

    // 9. Phase 3: Revision
    console.info(`[${chapterId}] Phase 3: Revision...`);
    await agent.executeRevision();

    // 10. Phase 4: Finalize - DB 저장 데이터 정리
    console.info(`[${chapterId}] Phase 4: Finalizing...`);
    const finalizeResult = await agent.executeFinalize();

    // 11. Save to database using write MCP
    console.info(`[${chapterId}] Saving to database...`);
    await saveToDatabase(chapterId, finalizeResult);

    // 12. Calculate execution time
    const executionTime = Date.now() - startTime;
    console.info(
      `[${chapterId}] Completed in ${(executionTime / 1000).toFixed(1)}s`,
    );

    // 13. Return response
    return NextResponse.json({
      success: true,
      chapterId,
      content: context.content,
      stats: {
        wordCount: context.content.length,
        charactersAdded: finalizeResult.characters.length,
        placesAdded: finalizeResult.places.length,
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

// Helper: Save to database using write MCP tools
async function saveToDatabase(
  chapterId: string,
  finalizeResult: {
    episode: { id: string; content: string; summary: string };
    characters: Array<Record<string, unknown>>;
    places: Array<Record<string, unknown>>;
  },
) {
  const baseUrl = ENV.NEXT_PUBLIC_URL || 'http://localhost:3000';
  const writeDbUrl = `${baseUrl}/api/escape-from-seoul/mcp/write-db`;

  const callWriteTool = async (toolName: string, args: unknown) => {
    console.info(`[${chapterId}] Calling ${toolName}`);

    const response = await fetch(writeDbUrl, {
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
        `Failed ${toolName}: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(
        `MCP ${toolName} error: ${payload.error.message ?? 'Unknown error'}`,
      );
    }

    console.info(`[${chapterId}] Completed ${toolName}`);

    return payload.result;
  };

  // 중복 에러 판별 헬퍼
  const isDuplicateError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();

    return message.includes('duplicate') || message.includes('already exists');
  };

  // 1. Save episode
  await callWriteTool('episodes.create', {
    id: finalizeResult.episode.id,
    content: finalizeResult.episode.content,
    summary: finalizeResult.episode.summary,
    characters: finalizeResult.characters.map((c) => c.name).filter(Boolean),
    places: finalizeResult.places.map((p) => p.name).filter(Boolean),
  });

  // 2. Save/update places
  for (const place of finalizeResult.places) {
    try {
      await callWriteTool('places.create', place);
    } catch (error) {
      if (isDuplicateError(error)) {
        await callWriteTool('places.update', place);
      } else {
        throw error;
      }
    }
  }

  // 3. Save/update characters
  for (const character of finalizeResult.characters) {
    try {
      await callWriteTool('characters.create', character);
    } catch (error) {
      if (isDuplicateError(error)) {
        await callWriteTool('characters.update', character);
      } else {
        throw error;
      }
    }
  }
}
