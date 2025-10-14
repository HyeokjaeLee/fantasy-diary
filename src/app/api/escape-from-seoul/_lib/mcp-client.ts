import type { FunctionDeclaration } from '@google/genai';

import { googleTools } from '@/configs/trpc/routes/escape-from-seoul/mcp/google';
import { readDbTools } from '@/configs/trpc/routes/escape-from-seoul/mcp/readDb';
import { weatherTools } from '@/configs/trpc/routes/escape-from-seoul/mcp/weather';
import { writeDbTools } from '@/configs/trpc/routes/escape-from-seoul/mcp/writeDb';

// MCP tools를 Gemini function schema로 변환
const toGeminiToolName = (mcpName: string): string => mcpName.replace(/\./g, '_');
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

const resolveToolCollection = (mcpToolName: string) => {
  const [category, action] = mcpToolName.split('.');

  if (category === 'google') return toolCollections.google;
  if (category === 'weather') return toolCollections.weather;

  if (['episodes', 'characters', 'places'].includes(category)) {
    const writeActions = ['create', 'update', 'delete'];

    return writeActions.includes(action)
      ? toolCollections.writeDb
      : toolCollections.readDb;
  }

  throw new Error(`Unknown tool category: ${category}`);
}

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

// Gemini function call을 MCP tools/call로 실행
export async function executeMcpTool(
  toolName: string,
  args: unknown,
): Promise<string> {
  // Gemini 도구 이름을 MCP 형식으로 변환
  const mcpToolName = toMcpToolName(toolName);
  const collection = resolveToolCollection(mcpToolName);
  const tool = collection.find(({ name }) => name === mcpToolName);
  if (!tool) {
    throw new Error(`Tool ${mcpToolName} not found`);
  }

  const result = await tool.handler(args);

  return JSON.stringify(result);
}
