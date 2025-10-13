import type { FunctionDeclaration } from '@google/genai';

import { ENV } from '@/env';

// 내부 MCP 서버 호출 헬퍼
async function callInternalMcp(
  endpoint: string,
  method: string,
  params?: unknown,
) {
  const baseUrl = ENV.NEXT_PUBLIC_URL;
  const url = `${baseUrl}/api/escape-from-seoul/mcp/${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    let detail: string;
    try {
      const bodyText = await response.text();
      if (!bodyText) {
        detail = '(empty response body)';
      } else {
        try {
          const parsed = JSON.parse(bodyText) as Record<string, unknown>;
          const errorField = parsed['error'];
          let message: unknown;
          if (errorField && typeof errorField === 'object') {
            message = (errorField as Record<string, unknown>).message;
          }
          detail =
            typeof message === 'string' && message.length > 0
              ? message
              : JSON.stringify(parsed);
        } catch {
          detail = bodyText;
        }
      }
    } catch {
      detail = '(failed to read error body)';
    }

    throw new Error(
      `MCP call failed: ${response.status} ${response.statusText} - ${detail}`,
    );
  }

  return response.json();
}

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

// MCP tools를 Gemini function schema로 변환
// 도구 이름 변환: MCP(dot) ↔ Gemini(underscore)
const toGeminiToolName = (mcpName: string): string => mcpName.replace(/\./g, '_');
const toMcpToolName = (geminiName: string): string =>
  geminiName.replace(/_/g, '.');

// 도구 이름으로 MCP 엔드포인트 결정
function getMcpEndpoint(mcpToolName: string): string {
  const [category, action] = mcpToolName.split('.');

  // 카테고리 기반 라우팅
  const categoryEndpoints: Record<string, string> = {
    weather: 'weather',
    google: 'google',
    geo: 'geo',
  };

  if (categoryEndpoints[category]) {
    return categoryEndpoints[category];
  }

  // DB 관련 도구는 action에 따라 read/write 분기
  if (['episodes', 'characters', 'places'].includes(category)) {
    const writeActions = ['create', 'update', 'delete'];

    return writeActions.includes(action) ? 'write-db' : 'read-db';
  }

  throw new Error(`Unknown tool category: ${category}`);
}

export async function getMcpFunctionDeclarations(): Promise<
  FunctionDeclaration[]
> {
  // MCP 서버의 tools/list 병렬 호출
  const [weatherTools, googleTools, readTools, writeTools] = await Promise.all([
    callInternalMcp('weather', 'tools/list'),
    callInternalMcp('google', 'tools/list'),
    callInternalMcp('read-db', 'tools/list'),
    callInternalMcp('write-db', 'tools/list'),
  ]);

  // 모든 도구 합치기
  const allTools = [
    ...((weatherTools.result?.tools as McpTool[]) || []),
    ...((googleTools.result?.tools as McpTool[]) || []),
    ...((readTools.result?.tools as McpTool[]) || []),
    ...((writeTools.result?.tools as McpTool[]) || []),
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
  const endpoint = getMcpEndpoint(mcpToolName);

  // MCP tools/call 실행
  const result = await callInternalMcp(endpoint, 'tools/call', {
    name: mcpToolName,
    arguments: args,
  });

  // 결과 텍스트 추출
  if (result.result?.content?.[0]?.text) {
    return result.result.content[0].text;
  }

  throw new Error(`Invalid MCP response: ${JSON.stringify(result)}`);
}
