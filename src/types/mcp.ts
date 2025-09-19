import type { JSONSchema4 } from 'json-schema';
import { z } from 'zod';

// JSON-RPC base types
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccess<TResult> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcError;
}

// MCP Tool types (subset aligned with spec)
export interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JSONSchema4;
  outputSchema?: JSONSchema4;
  annotations?: Record<string, unknown>;
}

export interface ListToolsResult {
  tools: Tool[];
  nextCursor?: string;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
}

// tools/call request params per spec
export interface CallToolRequestParams {
  name: string;
  arguments?: Record<string, unknown>;
}

// tools/call result shape (minimum)
export interface CallToolResult {
  content: Array<{ type: 'text'; text: string } | { type: string; [k: string]: unknown }>;
  structuredContent?: unknown;
}

// Zod schemas for runtime validation
export const zJsonRpcId = z.union([z.string(), z.number(), z.null()]);
export const zJsonRpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: zJsonRpcId,
  method: z.string(),
  params: z.unknown().optional(),
});

export const zCallToolParams = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
