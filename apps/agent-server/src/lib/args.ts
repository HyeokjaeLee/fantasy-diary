type ArgMap = Record<string, string | boolean>;

export type { ArgMap };

export function parseArgs(argv: string[]): { args: ArgMap; positionals: string[] } {
  const args: ArgMap = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);

    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      args[key] = rest.join("=");
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      i++;
      continue;
    }

    args[withoutPrefix] = true;
  }

  return { args, positionals };
}

export function toBoolean(
  value: string | boolean | undefined,
  defaultValue: boolean
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  return defaultValue;
}
