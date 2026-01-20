import { mkdir } from "node:fs/promises";

import { SQL } from "bun";

type TableCommentRow = {
  table_name: string;
  table_comment: string | null;
};

type ColumnCommentRow = {
  table_name: string;
  column_name: string;
  column_comment: string | null;
};

type GenerateOptions = {
  projectId: string;
  schema: string;
  outFile: string;
};

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeJSDocText(text: string): string {
  return text.split("*/").join("*\\/");
}

function previousLineIncludesTag(
  source: string,
  lineStartIndex: number,
  tag: string
): boolean {
  if (lineStartIndex <= 0) return false;
  const prevLineEnd = lineStartIndex - 1;
  const prevLineStart = source.lastIndexOf("\n", prevLineEnd - 1) + 1;
  const prevLine = source.slice(prevLineStart, prevLineEnd);

  return prevLine.includes(tag);
}

function insertTableCommentJSDoc(params: {
  source: string;
  tableName: string;
  tableComment: string;
}): string {
  const { tableName } = params;
  const tableComment = sanitizeJSDocText(params.tableComment.trim());
  if (!tableComment) return params.source;

  let source = params.source;

  const tableHeaderRe = new RegExp(`^(\\s+)${escapeForRegExp(tableName)}: \\{\\s*$`, "m");
  const tableHeaderMatch = tableHeaderRe.exec(source);
  if (!tableHeaderMatch) return source;

  const tableIndent = tableHeaderMatch[1];
  const tableHeaderIndex = tableHeaderMatch.index;
  const tableTag = `@table ${tableName}`;
  const tableCommentLine = `${tableIndent}/** ${tableTag}: ${tableComment} */\n`;

  if (!previousLineIncludesTag(source, tableHeaderIndex, tableTag)) {
    source = source.slice(0, tableHeaderIndex) + tableCommentLine + source.slice(tableHeaderIndex);
  }

  return source;
}

function findMatchingBraceIndex(source: string, openBraceIndex: number): number | null {

  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return null;
}

function insertColumnCommentsIntoObjectBlock(params: {
  block: string;
  tableName: string;
  columnComments: Map<string, string>;
}): string {
  const lines = params.block.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(\s*)([A-Za-z0-9_]+)(\?)?:\s/.exec(line);
    if (!match) continue;

    const indent = match[1];
    const columnName = match[2];
    const comment = params.columnComments.get(columnName);
    if (!comment) continue;

    const tag = `@column ${params.tableName}.${columnName}`;
    if (i > 0 && lines[i - 1].includes(tag)) continue;

    const sanitized = sanitizeJSDocText(comment.trim());
    if (!sanitized) continue;

    lines.splice(i, 0, `${indent}/** ${tag}: ${sanitized} */`);
    i++;
  }

  return lines.join("\n");
}

function replaceNamedObjectBlock(params: {
  source: string;
  name: string;
  transform: (block: string) => string;
}): string {
  const headerRe = new RegExp(`^(\\s+)${escapeForRegExp(params.name)}: \\{\\s*$`, "m");
  const headerMatch = headerRe.exec(params.source);
  if (!headerMatch) return params.source;

  const headerStart = headerMatch.index;
  const openBraceIndex = params.source.indexOf("{", headerStart);
  if (openBraceIndex === -1) return params.source;

  const closeBraceIndex = findMatchingBraceIndex(params.source, openBraceIndex);
  if (closeBraceIndex === null) return params.source;

  const before = params.source.slice(0, headerStart);
  const block = params.source.slice(headerStart, closeBraceIndex + 1);
  const after = params.source.slice(closeBraceIndex + 1);

  return before + params.transform(block) + after;
}

function insertColumnCommentsJSDoc(params: {
  source: string;
  tableName: string;
  columnComments: Map<string, string>;
}): string {
  const tableHeaderRe = new RegExp(
    `^(\\s+)${escapeForRegExp(params.tableName)}: \\{\\s*$`,
    "m"
  );
  const tableHeaderMatch = tableHeaderRe.exec(params.source);
  if (!tableHeaderMatch) return params.source;

  const tableHeaderStart = tableHeaderMatch.index;
  const tableOpenBraceIndex = params.source.indexOf("{", tableHeaderStart);
  if (tableOpenBraceIndex === -1) return params.source;

  const tableCloseBraceIndex = findMatchingBraceIndex(params.source, tableOpenBraceIndex);
  if (tableCloseBraceIndex === null) return params.source;

  let tableBlock = params.source.slice(tableHeaderStart, tableCloseBraceIndex + 1);

  for (const typeName of ["Row", "Insert", "Update"]) {
    tableBlock = replaceNamedObjectBlock({
      source: tableBlock,
      name: typeName,
      transform: (block) =>
        insertColumnCommentsIntoObjectBlock({
          block,
          tableName: params.tableName,
          columnComments: params.columnComments,
        }),
    });
  }

  return (
    params.source.slice(0, tableHeaderStart) +
    tableBlock +
    params.source.slice(tableCloseBraceIndex + 1)
  );
}

async function genTypes({
  projectId,
  schema,
}: GenerateOptions): Promise<string> {
  const proc = Bun.spawn(
    [
      "supabase",
      "gen",
      "types",
      "typescript",
      "--project-id",
      projectId,
      "--schema",
      schema,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(
      [
        `supabase gen types failed (exit ${exitCode})`,
        stderr.trim() ? `stderr: ${stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return stdout;
}

function getTableCommentsFromRows(rows: TableCommentRow[]): Map<string, string> {
  const comments = new Map<string, string>();
  for (const row of rows) {
    if (row.table_comment && row.table_comment.trim()) {
      comments.set(row.table_name, row.table_comment);
    }
  }

  return comments;
}

function getColumnCommentsFromRows(rows: ColumnCommentRow[]): Map<string, Map<string, string>> {
  const comments = new Map<string, Map<string, string>>();

  for (const row of rows) {
    if (!row.column_comment || !row.column_comment.trim()) continue;

    let byColumn = comments.get(row.table_name);
    if (!byColumn) {
      byColumn = new Map();
      comments.set(row.table_name, byColumn);
    }

    byColumn.set(row.column_name, row.column_comment);
  }

  return comments;
}

type DbConnectTarget = {
  label: string;
  host: string;
  port: number;
  username: string;
  serverName: string;
};

function buildConnectionTargets(params: {
  projectId: string;
  region: string;
  prefer: "pooler" | "direct";
}): DbConnectTarget[] {
  const directHost = `db.${params.projectId}.supabase.co`;
  const poolerHost = `aws-0-${params.region}.pooler.supabase.com`;

  const direct: DbConnectTarget = {
    label: "direct",
    host: directHost,
    port: 5432,
    username: "postgres",
    serverName: directHost,
  };

  const pooler: DbConnectTarget = {
    label: "pooler",
    host: poolerHost,
    port: 6543,
    username: `postgres.${params.projectId}`,
    serverName: poolerHost,
  };

  return params.prefer === "direct" ? [direct, pooler] : [pooler, direct];
}

type DbConnectFailure = {
  attempt: string;
  message: string;
};

async function fetchSchemaComments(params: {
  schema: string;
  projectId: string;
  password: string;
  region: string;
  prefer: "pooler" | "direct";
}): Promise<{
  tableComments: Map<string, string>;
  columnComments: Map<string, Map<string, string>>;
  lastAttempt?: string;
  error?: unknown;
  failures: DbConnectFailure[];
}> {
  const targets = buildConnectionTargets({
    projectId: params.projectId,
    region: params.region,
    prefer: params.prefer,
  });

  let lastError: unknown = null;
  let lastAttempt: string | undefined;
  const failures: DbConnectFailure[] = [];

  for (const target of targets) {
    lastAttempt = `${target.label} (${target.username}@${target.host}:${target.port})`;

    const sql = new SQL({
      hostname: target.host,
      port: target.port,
      user: target.username,
      password: params.password,
      database: "postgres",
      tls: { serverName: target.serverName },
      connectionTimeout: 10,
      prepare: false,
    });

    try {
      await sql.connect();

      const tableRows = await sql<TableCommentRow[]>`
        select
          c.relname as table_name,
          obj_description(c.oid) as table_comment
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = ${params.schema}
          and c.relkind = 'r'
        order by c.relname;
      `;

      const columnRows = await sql<ColumnCommentRow[]>`
        select
          c.relname as table_name,
          a.attname as column_name,
          col_description(c.oid, a.attnum) as column_comment
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        where n.nspname = ${params.schema}
          and c.relkind = 'r'
          and a.attnum > 0
          and not a.attisdropped
        order by c.relname, a.attnum;
      `;

      return {
        tableComments: getTableCommentsFromRows(tableRows),
        columnComments: getColumnCommentsFromRows(columnRows),
        lastAttempt,
        failures,
      };
    } catch (err) {
      lastError = err;

      const message = (() => {
        if (err instanceof SQL.PostgresError) {
          return [
            err.message,
            err.code ? `code=${err.code}` : "",
            err.detail ? `detail=${err.detail}` : "",
            err.hint ? `hint=${err.hint}` : "",
          ]
            .filter(Boolean)
            .join(" | ");
        }

        return err instanceof Error ? err.message : String(err);
      })();

      failures.push({ attempt: lastAttempt ?? target.label, message });
      const authError =
        message.includes("password authentication failed") ||
        message.includes("Too many authentication errors") ||
        message.includes("authentication");

      if (authError) break;
    } finally {
      try {
        await sql.close();
      } catch (closeErr) {
        void closeErr;
      }
    }
  }

  return {
    tableComments: new Map(),
    columnComments: new Map(),
    lastAttempt,
    error: lastError,
    failures,
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

async function main(): Promise<void> {
  const options: GenerateOptions = {
    projectId: requireEnv("SUPABASE_PROJECT_ID"),
    schema: process.env.SUPABASE_SCHEMA ?? "public",
    outFile: process.env.SUPABASE_TYPES_OUTFILE ?? "__generated__/supabase.ts",
  };

  const region = process.env.SUPABASE_REGION ?? "ap-northeast-2";
  const prefer = (process.env.SUPABASE_DB_CONNECT_PREFER ?? "pooler") === "direct" ? "direct" : "pooler";
  const password = requireEnv("SUPABASE_DB_PASSWORD");

  await mkdir("__generated__", { recursive: true });

  const typesSource = await genTypes(options);
  const {
    tableComments,
    columnComments,
    lastAttempt,
    error,
    failures,
  } = await fetchSchemaComments({
    schema: options.schema,
    projectId: options.projectId,
    password,
    region,
    prefer,
  });

  let output = typesSource;

  for (const [tableName, tableComment] of tableComments) {
    output = insertTableCommentJSDoc({ source: output, tableName, tableComment });
  }

  for (const [tableName, byColumn] of columnComments) {
    output = insertColumnCommentsJSDoc({ source: output, tableName, columnComments: byColumn });
  }

  await Bun.write(options.outFile, output);

  if (tableComments.size === 0 && columnComments.size === 0) {
    const lines = ["No table/column comments applied."];
    if (lastAttempt) lines.push(`Last attempt: ${lastAttempt}`);
    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`Reason: ${message}`);
    }

    if (failures.length > 0) {
      lines.push("Attempts:");
      for (const failure of failures) {
        const oneLine = failure.message.split("\n").join(" ").trim();
        lines.push(`- ${failure.attempt}: ${oneLine}`);
      }
    }

    console.warn(lines.join("\n"));
  }
}

await main();
