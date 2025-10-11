import {
  JsonRpcErrorCode,
  JsonRpcErrorMessage,
  type JsonRpcRequest,
  zCallToolParams,
  zJsonRpcRequest,
} from '@/types/mcp';
import { NextResponse } from '@/utils/next-response';

export interface ToolDef<TInput = unknown, TOutput = unknown> {
  name: string;
  description?: string;
  inputSchema: object;
  usageGuidelines?: string[];
  allowedPhases?: string[];
  handler: (args: TInput) => Promise<TOutput>;
}

interface HandleMcpRequestOptions {
  req: Request;
  tools: Array<ToolDef<unknown, unknown>>;
  includeUsageInfo?: boolean;
}

export const handleMcpRequest = async ({
  req,
  tools,
  includeUsageInfo = false,
}: HandleMcpRequestOptions) => {
  let body: JsonRpcRequest | null = null;

  try {
    const request = zJsonRpcRequest.parse(await req.json());
    body = request;

    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return NextResponse.jsonRpcFail({
        code: JsonRpcErrorCode.InvalidRequest,
        message: JsonRpcErrorMessage.InvalidRequest,
        id: request.id ?? null,
      });
    }

    if (request.method === 'tools/list') {
      return NextResponse.jsonRpcOk({
        id: request.id,
        result: {
          tools: tools.map((t) => {
            const baseTool = {
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            };

            if (!includeUsageInfo) return baseTool;

            return {
              ...baseTool,
              usageGuidelines: t.usageGuidelines,
              allowedPhases: t.allowedPhases,
            };
          }),
        },
      });
    }

    if (request.method === 'tools/call') {
      const parsed = zCallToolParams.safeParse(request.params ?? {});
      if (!parsed.success || !parsed.data.name) {
        return NextResponse.jsonRpcFail({
          code: JsonRpcErrorCode.InvalidParams,
          message: JsonRpcErrorMessage.InvalidParams,
          id: request.id,
        });
      }

      const tool = tools.find((t) => t.name === parsed.data.name);
      if (!tool) {
        return NextResponse.jsonRpcFail({
          code: JsonRpcErrorCode.ToolNotFound,
          message: JsonRpcErrorMessage.ToolNotFound,
          id: request.id,
        });
      }

      const result = await tool.handler(parsed.data.arguments ?? {});

      return NextResponse.jsonRpcOk({
        id: request.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        },
      });
    }

    return NextResponse.jsonRpcFail({
      code: JsonRpcErrorCode.MethodNotFound,
      message: JsonRpcErrorMessage.MethodNotFound,
      id: request.id,
    });
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : JsonRpcErrorMessage.UnknownError;
    const errorData =
      e instanceof Error
        ? { stack: e.stack ?? null, name: e.name ?? null }
        : { error: e };
    console.error(
      `[MCP] ${body?.method ?? 'unknown method'} failed: ${errorMessage}`,
      e,
    );

    return NextResponse.jsonRpcFail({
      id: body?.id ?? null,
      code: JsonRpcErrorCode.UnknownError,
      message: errorMessage,
      data: errorData,
    });
  }
};
