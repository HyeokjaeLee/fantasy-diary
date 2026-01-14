type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): { args: ArgMap; positionals: string[] } {
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

const { args, positionals } = parseArgs(Bun.argv.slice(2));

const kind = typeof args.kind === "string" ? args.kind : "daily";
const rawPayload = typeof args.payload === "string" ? args.payload : undefined;

let payload: unknown = undefined;
if (rawPayload) {
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    console.error("Invalid JSON for --payload");
    process.exit(2);
  }
}

const result = {
  ok: true,
  job: "agent-server",
  kind,
  positionals,
  payload,
  now: new Date().toISOString(),
};

console.log(JSON.stringify(result));
