import { mkdir } from "node:fs/promises";

import { SQL } from "bun";
import { nanoid } from "nanoid";

type TableCommentRow = {
  table_name: string;
  table_comment: string | null;
};

type ColumnCommentRow = {
  table_name: string;
  column_name: string;
  column_comment: string | null;
};

type ColumnMetaRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

type EnumMetaRow = {
  type_name: string;
  enum_label: string;
  enum_sort: number;
};

type GenerateOptions = {
  projectId: string;
  schema: string;
  outFile: string;
};

function sanitizeJSDocText(text: string): string {
  return text.split("*/").join("*\\/");
}

function quoteStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function isValidObjectKey(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
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

type ColumnMeta = {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  hasDefault: boolean;
};

function getColumnsFromRows(rows: ColumnMetaRow[]): Map<string, ColumnMeta[]> {
  const byTable = new Map<string, ColumnMeta[]>();

  for (const row of rows) {
    let list = byTable.get(row.table_name);
    if (!list) {
      list = [];
      byTable.set(row.table_name, list);
    }

    list.push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      isNullable: row.is_nullable === "YES",
      hasDefault: Boolean(row.column_default),
    });
  }

  return byTable;
}

function getEnumsFromRows(rows: EnumMetaRow[]): Map<string, string[]> {
  const byType = new Map<string, string[]>();

  const sorted = [...rows].sort((a, b) => {
    if (a.type_name !== b.type_name) return a.type_name.localeCompare(b.type_name);

    return a.enum_sort - b.enum_sort;
  });

  for (const row of sorted) {
    let list = byType.get(row.type_name);
    if (!list) {
      list = [];
      byType.set(row.type_name, list);
    }

    list.push(row.enum_label);
  }

  return byType;
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

async function fetchSchemaMeta(params: {
  schema: string;
  projectId: string;
  password: string;
  region: string;
  prefer: "pooler" | "direct";
}): Promise<{
  tableComments: Map<string, string>;
  columnComments: Map<string, Map<string, string>>;
  columnsByTable: Map<string, ColumnMeta[]>;
  enums: Map<string, string[]>;
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

      const columnMetaRows = await sql<ColumnMetaRow[]>`
        select
          c.table_name,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
          and t.table_name = c.table_name
        where c.table_schema = ${params.schema}
          and t.table_type = 'BASE TABLE'
        order by c.table_name, c.ordinal_position;
      `;

      const enumRows = await sql<EnumMetaRow[]>`
        select
          t.typname as type_name,
          e.enumlabel as enum_label,
          e.enumsortorder as enum_sort
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = ${params.schema}
        order by t.typname, e.enumsortorder;
      `;

      return {
        tableComments: getTableCommentsFromRows(tableRows),
        columnComments: getColumnCommentsFromRows(columnRows),
        columnsByTable: getColumnsFromRows(columnMetaRows),
        enums: getEnumsFromRows(enumRows),
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
    columnsByTable: new Map(),
    enums: new Map(),
    lastAttempt,
    error: lastError,
    failures,
  };
}

function renderZodSchemaSource(params: {
  schema: string;
  tableComments: Map<string, string>;
  columnComments: Map<string, Map<string, string>>;
  columnsByTable: Map<string, ColumnMeta[]>;
  enums: Map<string, string[]>;
}): string {
  const enumNames = Array.from(params.enums.keys()).sort();
  const tableNames = Array.from(params.columnsByTable.keys()).sort();

  // ID 컬럼 감지: 컬럼명이 'id'인 경우 NanoID로 처리
  function isNanoIdColumn(tableName: string, columnName: string): boolean {
    return columnName === 'id';
  }

  function zodForUdtName(udtName: string): string {
    if (params.enums.has(udtName)) return `publicEnums.${udtName}`;

    switch (udtName) {
      case "uuid":
        return "z.uuid()";
      case "text":
      case "varchar":
      case "bpchar":
        return "z.string()";
      case "int2":
      case "int4":
      case "int8":
        return "z.int()";
      case "float4":
      case "float8":
      case "numeric":
        return "z.number()";
      case "bool":
        return "z.boolean()";
      case "date":
        return "z.iso.date()";
      case "timestamp":
        return "z.iso.datetime({ local: true })";
      case "timestamptz":
        return "z.iso.datetime({ offset: true })";
      case "json":
      case "jsonb":
        return "z.unknown()";
      case "vector":
        return "z.string()";
      default:
        return "z.unknown()";
    }
  }

  function zodForColumn(column: ColumnMeta, tableName: string): string {
    // NanoID 컬럼 감지: ID 컬럼은 z.string().nanoid() 사용
    if (isNanoIdColumn(tableName, column.name)) {
      return "z.string().nanoid()";
    }

    if (column.dataType === "ARRAY" || column.udtName.startsWith("_")) {
      const elementUdt = column.udtName.startsWith("_")
        ? column.udtName.slice(1)
        : column.udtName;

      return `z.array(${zodForUdtName(elementUdt)})`;
    }

    if (column.dataType === "USER-DEFINED") {
      return zodForUdtName(column.udtName);
    }

    switch (column.dataType) {
      case "uuid":
        return "z.uuid()";
      case "text":
        return "z.string()";
      case "boolean":
        return "z.boolean()";
      case "integer":
      case "smallint":
      case "bigint":
        return "z.int()";
      case "real":
      case "double precision":
      case "numeric":
        return "z.number()";
      case "date":
        return "z.iso.date()";
      case "timestamp with time zone":
        return "z.iso.datetime({ offset: true })";
      case "timestamp without time zone":
        return "z.iso.datetime({ local: true })";
      case "json":
      case "jsonb":
        return "z.unknown()";
      default:
        return "z.unknown()";
    }
  }

  function wrapNullable(schema: string, isNullable: boolean): string {
    return isNullable ? `${schema}.nullable()` : schema;
  }

  function isInsertRequired(column: ColumnMeta): boolean {
    return !column.isNullable && !column.hasDefault;
  }

  const lines: string[] = [];

  lines.push("/*");
  lines.push(" * This file is auto-generated by scripts/generate-supabase-zod.ts");
  lines.push(" * Do not edit manually.");
  lines.push(" */");
  lines.push("");
  lines.push("import { z } from \"zod\";");
  lines.push("");

  lines.push("export const publicEnums = {");
  for (const enumName of enumNames) {
    const values = params.enums.get(enumName) ?? [];
    const literalList = values.map(quoteStringLiteral).join(", ");
    lines.push(`  ${enumName}: z.enum([${literalList}]),`);
  }
  lines.push("} as const;");
  lines.push("");

  lines.push("export const publicTables = {");
  for (const tableName of tableNames) {
    const tableComment = params.tableComments.get(tableName);
    if (tableComment) {
      const tag = `@table ${tableName}`;
      lines.push(`  /** ${tag}: ${sanitizeJSDocText(tableComment.trim())} */`);
    }

    const columns = params.columnsByTable.get(tableName) ?? [];
    const byColumnComment = params.columnComments.get(tableName);

    lines.push(`  ${tableName}: {`);

    lines.push("    Row: z.object({");
    for (const column of columns) {
      const comment = byColumnComment?.get(column.name);
      if (comment) {
        const tag = `@column ${tableName}.${column.name}`;
        lines.push(`      /** ${tag}: ${sanitizeJSDocText(comment.trim())} */`);
      }

      const key = isValidObjectKey(column.name) ? column.name : quoteStringLiteral(column.name);
      const base = wrapNullable(zodForColumn(column, tableName), column.isNullable);
      lines.push(`      ${key}: ${base},`);
    }
    lines.push("    }).strict(),");

    lines.push("    Insert: z.object({");
    for (const column of columns) {
      const comment = byColumnComment?.get(column.name);
      if (comment) {
        const tag = `@column ${tableName}.${column.name}`;
        lines.push(`      /** ${tag}: ${sanitizeJSDocText(comment.trim())} */`);
      }

      const key = isValidObjectKey(column.name) ? column.name : quoteStringLiteral(column.name);
      const base = wrapNullable(zodForColumn(column, tableName), column.isNullable);
      const schema = isInsertRequired(column) ? base : `${base}.optional()`;
      lines.push(`      ${key}: ${schema},`);
    }
    lines.push("    }).strict(),");

    lines.push("    Update: z.object({");
    for (const column of columns) {
      const comment = byColumnComment?.get(column.name);
      if (comment) {
        const tag = `@column ${tableName}.${column.name}`;
        lines.push(`      /** ${tag}: ${sanitizeJSDocText(comment.trim())} */`);
      }

      const key = isValidObjectKey(column.name) ? column.name : quoteStringLiteral(column.name);
      const base = wrapNullable(zodForColumn(column, tableName), column.isNullable);
      lines.push(`      ${key}: ${base}.optional(),`);
    }
    lines.push("    }).strict(),");

    lines.push("  },");
  }
  lines.push("} as const;");
  lines.push("");

  lines.push("export const SupabaseZod = {");
  lines.push("  public: {");
  lines.push("    Enums: publicEnums,");
  lines.push("    Tables: publicTables,");
  lines.push("  },");
  lines.push("} as const;");

  return lines.join("\n");
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);

  return value;
}

async function main(): Promise<void> {
  const options: GenerateOptions = {
    projectId: requireEnv("SUPABASE_PROJECT_ID"),
    schema: process.env.SUPABASE_SCHEMA ?? "public",
    outFile: process.env.SUPABASE_ZOD_OUTFILE ?? "__generated__/supabase.zod.ts",
  };

  const region = process.env.SUPABASE_REGION ?? "ap-northeast-2";
  const prefer = (process.env.SUPABASE_DB_CONNECT_PREFER ?? "pooler") === "direct" ? "direct" : "pooler";
  const password = requireEnv("SUPABASE_DB_PASSWORD");

  await mkdir("__generated__", { recursive: true });

  const {
    tableComments,
    columnComments,
    columnsByTable,
    enums,
    lastAttempt,
    error,
    failures,
  } = await fetchSchemaMeta({
    schema: options.schema,
    projectId: options.projectId,
    password,
    region,
    prefer,
  });

  const zodSource = renderZodSchemaSource({
    schema: options.schema,
    tableComments,
    columnComments,
    columnsByTable,
    enums,
  });

  await Bun.write(options.outFile, zodSource);

  if (columnsByTable.size === 0) {
    const lines = ["No tables found for Zod generation."];

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
