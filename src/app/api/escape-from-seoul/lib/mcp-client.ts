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
    throw new Error(`MCP call failed: ${response.statusText}`);
  }

  return response.json();
}

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

// MCP tools를 Gemini function schema로 변환
export async function getMcpFunctionDeclarations(): Promise<
  FunctionDeclaration[]
> {
  // 3개 MCP 서버의 tools/list 병렬 호출
  const [geoTools, readTools, writeTools] = await Promise.all([
    callInternalMcp('geo', 'tools/list'),
    callInternalMcp('read-db', 'tools/list'),
    callInternalMcp('write-db', 'tools/list'),
  ]);

  // 모든 도구 합치기
  const allTools = [
    ...((geoTools.result?.tools as McpTool[]) || []),
    ...((readTools.result?.tools as McpTool[]) || []),
    ...((writeTools.result?.tools as McpTool[]) || []),
  ];

  // Gemini function schema로 변환
  return allTools.map((tool) => {
    const declaration: FunctionDeclaration = {
      name: tool.name.replace(/\./g, '_'),
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
  // Convert underscores back to dots for MCP tool names
  const mcpToolName = toolName.replace(/_/g, '.');
  const [category] = mcpToolName.split('.');

  // 카테고리별 엔드포인트 매핑
  let endpoint: string;
  if (category === 'geo') {
    endpoint = 'geo';
  } else if (['entries', 'characters', 'places'].includes(category)) {
    // action에 따라 read-db vs write-db 결정
    const action = mcpToolName.split('.')[1];
    const isWrite = ['create', 'update', 'delete'].includes(action);
    endpoint = isWrite ? 'write-db' : 'read-db';
  } else {
    throw new Error(`Unknown tool category: ${category}`);
  }

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
