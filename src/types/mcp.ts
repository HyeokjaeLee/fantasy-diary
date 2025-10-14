import type { JSONSchema6TypeName } from 'json-schema';
import { z } from 'zod';

// JSON-RPC base types
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: TParams;
}

export interface Tool<
  TInputSchema extends string = string,
  TInput = unknown,
  TOutput = unknown,
> {
  name: string;
  description?: string;
  inputSchema: {
    additionalProperties: boolean;
    type: JSONSchema6TypeName;
    required: TInputSchema[];
    properties: Record<
      TInputSchema,
      {
        type: JSONSchema6TypeName;
        minimum?: number;
        maximum?: number;
        minLength?: number;
        maxLength?: number;
        default?: unknown;
        description: string;
        items?: { type: JSONSchema6TypeName };
        enum?: string[];
      }
    >;
  };
  usageGuidelines?: string[];
  allowedPhases?: string[];
  handler: (args: TInput) => Promise<TOutput>;
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

export enum JsonRpcErrorCode {
  // JSON-RPC 2.0 표준 에러 코드
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  // 커스텀 서버 에러
  TOOL_NOT_FOUND = -32001,
  TOOL_EXECUTION_ERROR = -32002,
  UNKNOWN_ERROR = -32099,
}

export const JsonRpcErrorMessage = {
  PARSE_ERROR: '파싱 실패',
  INVALID_REQUEST: '잘못된 요청',
  METHOD_NOT_FOUND: '메서드를 찾을 수 없음',
  INVALID_PARAMS: '잘못된 파라미터',
  INTERNAL_ERROR: '내부 서버 오류',
  TOOL_NOT_FOUND: '도구를 찾을 수 없음',
  TOOL_EXECUTION_ERROR: '도구 실행 오류',
  UNKNOWN_ERROR: '알 수 없는 오류',
} as const satisfies Record<keyof typeof JsonRpcErrorCode, string>;
