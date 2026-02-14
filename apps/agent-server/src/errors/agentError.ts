
type Guidance = {
  description: string;
  suggestedFix?: string;
};

const guidanceByTypeAndCode = {
  CALLING_TOOL_ERROR: {
    UNKNOWN_TOOL: {
      description: "The model requested a tool that is not registered.",
      suggestedFix: "Use only the declared tool names from functionDeclarations.",
    },
    TOOL_EXECUTION_FAILED: {
      description: "Tool execution failed unexpectedly.",
      suggestedFix: "Adjust arguments and try again; if persistent, simplify the query.",
    },

    UNSUPPORTED_TABLE: {
      description: "Tool tried to select from a table that is not allowed.",
      suggestedFix: "Pick one of the allowed tables in the tool description.",
    },
    SELECT_TOO_LONG: {
      description: "Tool select clause was too long.",
      suggestedFix: "Shorten the select clause (<= 500 chars).",
    },
    COLUMN_NOT_SELECTABLE: {
      description: "Tool attempted to select a disallowed/too-large column.",
      suggestedFix: "Remove the disallowed column from select.",
    },
    INVALID_COLUMN: {
      description: "Tool tried to filter/select by a column that does not exist.",
      suggestedFix: "Use only existing columns. For novels, use 'title' (not 'name').",
    },
    DB_ERROR: {
      description: "Supabase/Postgres rejected the query.",
      suggestedFix: "Adjust table/columns/filters to a valid query.",
    },
  },
  VALIDATION_ERROR: {
    REQUIRED: {
      description: "A required argument was missing.",
    },
    INVALID_ARGUMENT: {
      description: "An argument value was invalid.",
    },
    NOT_SUPPORTED: {
      description: "Operation not supported by this provider.",
    },
  },
  PARSE_ERROR: {
    INVALID_JSON: {
      description: "The model output was not valid JSON.",
    },
    INVALID_SHAPE: {
      description: "The model output JSON shape did not match the expected schema.",
    },
  },
  UPSTREAM_API_ERROR: {
    RATE_LIMITED: {
      description: "Upstream API rate-limited the request.",
      suggestedFix: "Wait and retry with backoff.",
    },
    UNAVAILABLE: {
      description: "Upstream API temporarily unavailable.",
      suggestedFix: "Retry with backoff.",
    },
    GEMINI_EMBED_FAILED: {
      description: "Gemini embedding request failed.",
      suggestedFix: "Retry with backoff; if persistent, reduce input length.",
    },
    GLM_API_ERROR: {
      description: "GLM API request failed.",
      suggestedFix: "Check API key and model name; retry with backoff.",
    },
  },
  DATABASE_ERROR: {
    QUERY_FAILED: {
      description: "Database query failed.",
      suggestedFix: "Check table/columns/filters and retry.",
    },
    INSERT_FAILED: {
      description: "Database insert failed.",
      suggestedFix: "Check required fields/constraints and retry.",
    },
    UPDATE_FAILED: {
      description: "Database update failed.",
      suggestedFix: "Check filters/constraints and retry.",
    },
    DELETE_FAILED: {
      description: "Database delete failed.",
      suggestedFix: "Check filters/constraints and retry.",
    },
  },
  UNEXPECTED_ERROR: {
    UNKNOWN: {
      description: "An unexpected error occurred.",
    },
  },
} as const satisfies Record<string, Record<string, Guidance>>;

export type AgentErrorType = keyof typeof guidanceByTypeAndCode;

type AgentErrorCodeKeyByType = {
  [T in AgentErrorType]: keyof (typeof guidanceByTypeAndCode)[T];
};

type AgentErrorInit<TType extends AgentErrorType> = {
  type: TType;
  code: AgentErrorCodeKeyByType[TType];
  message: string;
  retryable?: boolean;
  hint?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

function truncateString(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("key") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("token") ||
      normalizedKey.includes("authorization")
    ) {
      out[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "string") out[key] = truncateString(value, 600);
    else if (typeof value === "number" || typeof value === "boolean" || value === null)
      out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 20);
    else if (typeof value === "object") out[key] = "[Object]";
    else out[key] = "[Unserializable]";
  }

  return out;
}

export class AgentError<TType extends AgentErrorType = AgentErrorType> extends Error {
  readonly type: TType;
  readonly code: AgentErrorCodeKeyByType[TType];
  readonly retryable: boolean;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(init: AgentErrorInit<TType>) {
    super(init.message);
    this.name = "AgentError";

    this.type = init.type;
    this.code = init.code;
    this.retryable = init.retryable ?? false;
    this.hint = init.hint;
    this.details = init.details;
    this.cause = init.cause;
  }

  toLLMResponse(): Record<string, unknown> {
    const type = this.type;
    const code = String(this.code);
    const fullCode = `${type}.${code}`;

    const guidance = (guidanceByTypeAndCode as Record<string, Record<string, Guidance>>)[type]?.[
      code
    ];

    return {
      error: this.message,
      type,
      code: fullCode,
      code_key: code,
      retryable: this.retryable,
      ...(guidance ? { description: guidance.description } : {}),
      ...(guidance?.suggestedFix ? { suggested_fix: guidance.suggestedFix } : {}),
      ...(this.hint ? { hint: this.hint } : {}),
      ...(this.details ? { details: sanitizeDetails(this.details) } : {}),
    };
  }

  static messageFromUnknown(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;

    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }

  static fromUnknown<TType extends AgentErrorType>(
    err: unknown,
    fallback: Omit<AgentErrorInit<TType>, "message" | "cause"> & {
      messagePrefix?: string;
      hint?: string;
      details?: Record<string, unknown>;
    }
  ): AgentError<TType> {
    if (err instanceof AgentError) return err as AgentError<TType>;

    const message = AgentError.messageFromUnknown(err);
    const prefixed = fallback.messagePrefix ? `${fallback.messagePrefix}: ${message}` : message;

    return new AgentError<TType>({
      type: fallback.type,
      code: fallback.code,
      message: prefixed,
      retryable: fallback.retryable,
      hint: fallback.hint,
      details: fallback.details,
      cause: err,
    });
  }
}
