import type { FunctionDeclaration } from '@google/genai';

import { dbRead } from '../mcp/db-read';
import { readDbTools } from '../mcp/db-read/tools';
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
};

const toolCollections: ToolCollections = {
  google: googleTools,
  weather: weatherTools,
  readDb: readDbTools,
};

const resolveToolCategory = (
  mcpToolName: string,
): 'google' | 'weather' | 'readDb' => {
  const [category, action] = mcpToolName.split('.');

  if (category === 'google') return 'google';
  if (category === 'weather') return 'weather';

  if (['episodes', 'characters', 'places'].includes(category)) {
    if (['create', 'update', 'delete'].includes(action)) {
      throw new Error(
        `Write operation '${mcpToolName}' is not allowed. Use the API directly in the finalize phase.`,
      );
    }

    return 'readDb';
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
    } else {
      throw new Error(`Unknown category: ${category}`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`MCP tool execution failed: ${message}`);
  }
}
