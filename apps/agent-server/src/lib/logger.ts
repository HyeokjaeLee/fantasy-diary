type Logger = {
  info: (event: string, data?: Record<string, unknown>) => void;
  debug: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
};

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }

    return v;
  });
}

function truncateString(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[MaxDepth]";
  if (value === null) return null;

  const type = typeof value;
  if (type === "string") return truncateString(value as string, 400);
  if (type === "number" || type === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeForLog(v, depth + 1));
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const entries = Object.entries(obj).slice(0, 40);

    for (const [k, v] of entries) {
      const key = k.toLowerCase();
      if (
        key.includes("key") ||
        key.includes("secret") ||
        key.includes("token") ||
        key.includes("authorization")
      ) {
        out[k] = "[REDACTED]";
        continue;
      }

      out[k] = sanitizeForLog(v, depth + 1);
    }

    return out;
  }

  return "[Unserializable]";
}

export function createLogger(params: { quiet: boolean; debug: boolean }): Logger {
  function emit(
    level: "info" | "debug" | "warn" | "error",
    event: string,
    data?: Record<string, unknown>
  ) {
    if (params.quiet && level !== "error") return;
    if (level === "debug" && !params.debug) return;

    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(data ? { data: sanitizeForLog(data) } : {}),
    };

    const line = safeJsonStringify(payload);

    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }

  return {
    info: (event, data) => emit("info", event, data),
    debug: (event, data) => emit("debug", event, data),
    warn: (event, data) => emit("warn", event, data),
    error: (event, data) => emit("error", event, data),
  };
}

export type { Logger };
