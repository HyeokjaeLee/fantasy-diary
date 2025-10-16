import type { FunctionDeclaration } from '@google/genai';

import { dbRead } from '../mcp/db-read';
import { readDbTools } from '../mcp/db-read/tools';
import { dbWrite } from '../mcp/db-write';
import { writeDbTools } from '../mcp/db-write/tools';
import { googlePlaces } from '../mcp/google-places';
import { googleTools } from '../mcp/google-places/tools';
import { weather } from '../mcp/weather';
import { weatherTools } from '../mcp/weather/tools';

// MCP tools를 Gemini function schema로 변환
const toGeminiToolName = (mcpName: string): string =>
  mcpName.replace(/\./g, '_');
const toMcpToolName = (geminiName: string): string =>
  geminiName.replace(/_/g, '.');

type ToolCollections = {
  google: typeof googleTools;
  weather: typeof weatherTools;
  readDb: typeof readDbTools;
  writeDb: typeof writeDbTools;
};

const toolCollections: ToolCollections = {
  google: googleTools,
  weather: weatherTools,
  readDb: readDbTools,
  writeDb: writeDbTools,
};

const resolveToolCategory = (
  mcpToolName: string,
): 'google' | 'weather' | 'readDb' | 'writeDb' => {
  const [category, action] = mcpToolName.split('.');

  if (category === 'google') return 'google';
  if (category === 'weather') return 'weather';

  if (['episodes', 'characters', 'places'].includes(category)) {
    const writeActions = ['create', 'update', 'delete'];

    return writeActions.includes(action) ? 'writeDb' : 'readDb';
  }

  throw new Error(`Unknown tool category: ${category}`);
};

export async function getMcpFunctionDeclarations(): Promise<
  FunctionDeclaration[]
> {
  const allTools = [
    ...toolCollections.weather,
    ...toolCollections.google,
    ...toolCollections.readDb,
    ...toolCollections.writeDb,
  ];

  // Gemini function schema로 변환
  return allTools.map((tool) => {
    const declaration: FunctionDeclaration = {
      name: toGeminiToolName(tool.name),
      description: tool.description ?? '',
    };
    if (tool.inputSchema) {
      declaration.parametersJsonSchema = tool.inputSchema;
    }

    return declaration;
  });
}

// 서버 사이드 tRPC caller 생성
export async function executeMcpToolViaTrpc(
  toolName: string,
  args: unknown,
): Promise<string> {
  const mcpToolName = toMcpToolName(toolName);
  const category = resolveToolCategory(mcpToolName);

  try {
    let result: string;

    // 카테고리별 명시적 호출
    if (category === 'google') {
      const routerResult = await googlePlaces
        .createCaller({
          isClient: false,
          headers: undefined,
        })
        .execute({
          name: mcpToolName,
          arguments: args,
        });
      result = routerResult;
    } else if (category === 'weather') {
      const routerResult = await weather
        .createCaller({
          isClient: false,
          headers: undefined,
        })
        .execute({
          name: mcpToolName,
          arguments: args,
        });
      result = routerResult;
    } else if (category === 'readDb') {
      const routerResult = await dbRead
        .createCaller({
          isClient: false,
          headers: undefined,
        })
        .execute({
          name: mcpToolName,
          arguments: args,
        });
      result = routerResult;
    } else if (category === 'writeDb') {
      const routerResult = await dbWrite
        .createCaller({
          isClient: false,
          headers: undefined,
        })
        .execute({
          name: mcpToolName,
          arguments: args,
        });
      result = routerResult;
    } else {
      throw new Error(`Unknown category: ${category}`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`MCP tool execution failed: ${message}`);
  }
}
