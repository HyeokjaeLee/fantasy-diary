import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ENV } from '@/env';

import { getMcpToolsAsOpenAIFunctions } from './lib/mcp-client';
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

    console.log(`[${chapterId}] Starting chapter generation...`);

    // 3. Fetch previous chapter
    const previousChapter = await getPreviousChapter();

    // 4. Initialize ChapterContext
    const context: ChapterContext = {
      chapterId,
      currentTime,
      previousChapter,
      draft: {
        characters: [],
        places: [],
      },
    };

    // 5. Convert MCP Tools to OpenAI Functions
    console.log(`[${chapterId}] Loading MCP tools...`);
    const tools = await getMcpToolsAsOpenAIFunctions();
    console.log(`[${chapterId}] Loaded ${tools.length} tools`);

    // 6. Create Novel Agent
    const agent = new NovelWritingAgent(context, tools);

    // 7. Phase 1: Prewriting
    console.log(`[${chapterId}] Phase 1: Prewriting...`);
    await agent.executePrewriting();

    // 8. Phase 2: Drafting
    console.log(`[${chapterId}] Phase 2: Drafting...`);
    await agent.executeDrafting();

    // 9. Phase 3: Revision
    console.log(`[${chapterId}] Phase 3: Revision...`);
    const revisionResult = await agent.executeRevision();
    const finalContent = revisionResult.output;

    // 10. Save to database
    console.log(`[${chapterId}] Saving to database...`);
    await saveChapterToDb(chapterId, finalContent, context);

    // 11. Calculate execution time
    const executionTime = Date.now() - startTime;

    console.log(
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

    const result = await response.json();
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

  // 1. Save entry
  await fetch(writeDbUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'entries.create',
        arguments: {
          id,
          content,
          created_at: context.currentTime.toISOString(),
        },
      },
    }),
  });

  // 2. Save new characters
  for (const char of context.draft.characters) {
    await fetch(writeDbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'characters.create',
          arguments: char,
        },
      }),
    });
  }

  // 3. Save new places
  for (const place of context.draft.places) {
    await fetch(writeDbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'places.create',
          arguments: place,
        },
      }),
    });
  }
}
