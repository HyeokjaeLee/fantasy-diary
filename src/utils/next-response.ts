import { NextResponse as OriginalNextResponse } from 'next/server';

import type { JsonRpcErrorCode, JsonRpcId } from '@/types/mcp';

class JsonRpcResponse {
  jsonrpc = '2.0' as const;
  id: JsonRpcId;

  constructor(id: JsonRpcId) {
    this.id = id;
  }
}

interface JsonRpcSuccessParams<T> {
  id: JsonRpcId;
  result: T;
}

export class JsonRpcSuccess<T> extends JsonRpcResponse {
  result: T;
  constructor(params: JsonRpcSuccessParams<T>) {
    super(params.id);
    this.result = params.result;
  }
}

interface JsonRpcErrorParams<T = unknown> {
  id: JsonRpcId;
  code: JsonRpcErrorCode;
  message: string;
  data?: T;
}

export class JsonRpcFail<T> extends JsonRpcResponse {
  code: JsonRpcErrorCode;
  message: string;
  data?: T;

  constructor(params: JsonRpcErrorParams<T>) {
    super(params.id);
    this.code = params.code;
    this.message = params.message;
    this.data = params.data;
  }
}

export class NextResponse extends OriginalNextResponse {
  static jsonRpcOk<T>(params: JsonRpcSuccessParams<T>) {
    const response = new JsonRpcSuccess(params);

    return OriginalNextResponse.json(response);
  }

  static jsonRpcFail<T>(params: JsonRpcErrorParams<T>) {
    const response = new JsonRpcFail(params);

    return OriginalNextResponse.json(response, { status: 500 });
  }
}
