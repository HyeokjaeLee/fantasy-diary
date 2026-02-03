import { SQL } from "bun";
import { assert } from "es-toolkit/util";

type DbConnectTarget = {
  label: "pooler" | "direct";
  host: string;
  port: number;
  username: string;
  serverName: string;
};

type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  definition: string;
};

type TableRow = {
  table_name: string;
};

function requireEnv(key: string): string {
  const value = process.env[key];
  assert(value, `Missing env var: ${key}`);

  return value;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

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

async function connectDatabase(params: {
  projectId: string;
  password: string;
  region: string;
  prefer: "pooler" | "direct";
}): Promise<SQL> {
  const targets = buildConnectionTargets(params);
  let lastError: unknown = null;

  for (const target of targets) {
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

      return sql;
    } catch (err) {
      lastError = err;
      try {
        await sql.close();
      } catch (closeErr) {
        void closeErr;
      }

      const message = err instanceof Error ? err.message : String(err);
      const authError =
        message.includes("password authentication failed") ||
        message.includes("Too many authentication errors") ||
        message.includes("authentication");
      if (authError) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to connect to Supabase database.");
}

function replaceSchemaInConstraint(params: {
  definition: string;
  sourceSchema: string;
  targetSchema: string;
}): string {
  const { sourceSchema, targetSchema } = params;
  const quotedSource = quoteIdent(sourceSchema);
  const quotedTarget = quoteIdent(targetSchema);

  return params.definition
    .split(`${quotedSource}.`)
    .join(`${quotedTarget}.`)
    .split(`${sourceSchema}.`)
    .join(`${targetSchema}.`);
}

async function main(): Promise<void> {
  const projectId = requireEnv("SUPABASE_PROJECT_ID");
  const password = requireEnv("SUPABASE_DB_PASSWORD");
  const region = process.env.SUPABASE_REGION ?? "ap-northeast-2";
  const prefer =
    (process.env.SUPABASE_DB_CONNECT_PREFER ?? "pooler") === "direct"
      ? "direct"
      : "pooler";
  const sourceSchema = process.env.SUPABASE_MIGRATE_SOURCE_SCHEMA ?? "public";
  const targetSchema = process.env.SUPABASE_MIGRATE_TARGET_SCHEMA ?? "dev";

  const sql = await connectDatabase({ projectId, password, region, prefer });
  try {
    const tables = await sql<TableRow[]>`
      select table_name
      from information_schema.tables
      where table_schema = ${sourceSchema}
        and table_type = 'BASE TABLE'
      order by table_name;
    `;

    if (tables.length === 0) {
      throw new Error(`No tables found in schema: ${sourceSchema}`);
    }

    const quotedTargetSchema = quoteIdent(targetSchema);
    const quotedSourceSchema = quoteIdent(sourceSchema);

    await sql.unsafe(`create schema if not exists ${quotedTargetSchema};`);
    await sql.unsafe(
      `grant usage on schema ${quotedTargetSchema} to anon, authenticated, service_role;`
    );
    await sql.unsafe(
      `grant all on all tables in schema ${quotedTargetSchema} to anon, authenticated, service_role;`
    );
    await sql.unsafe(
      `grant all on all routines in schema ${quotedTargetSchema} to anon, authenticated, service_role;`
    );
    await sql.unsafe(
      `grant all on all sequences in schema ${quotedTargetSchema} to anon, authenticated, service_role;`
    );
    await sql.unsafe(
      `alter default privileges for role postgres in schema ${quotedTargetSchema} grant all on tables to anon, authenticated, service_role;`
    );
    await sql.unsafe(
      `alter default privileges for role postgres in schema ${quotedTargetSchema} grant all on routines to anon, authenticated, service_role;`
    );
    await sql.unsafe(
      `alter default privileges for role postgres in schema ${quotedTargetSchema} grant all on sequences to anon, authenticated, service_role;`
    );

    for (const { table_name } of tables) {
      const targetTable = `${quotedTargetSchema}.${quoteIdent(table_name)}`;
      await sql.unsafe(`drop table if exists ${targetTable} cascade;`);
    }

    for (const { table_name } of tables) {
      const sourceTable = `${quotedSourceSchema}.${quoteIdent(table_name)}`;
      const targetTable = `${quotedTargetSchema}.${quoteIdent(table_name)}`;
      await sql.unsafe(
        `create table ${targetTable} (like ${sourceTable} including all);`
      );
    }

    const targetConstraints = await sql<
      { table_name: string; constraint_name: string }[]
    >`
      select
        rel.relname as table_name,
        con.conname as constraint_name
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = ${targetSchema}
        and con.contype = 'f';
    `;

    for (const constraint of targetConstraints) {
      const targetTable = `${quotedTargetSchema}.${quoteIdent(constraint.table_name)}`;
      await sql.unsafe(
        `alter table ${targetTable} drop constraint if exists ${quoteIdent(
          constraint.constraint_name
        )};`
      );
    }

    const sourceConstraints = await sql<ConstraintRow[]>`
      select
        rel.relname as table_name,
        con.conname as constraint_name,
        pg_get_constraintdef(con.oid) as definition
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = ${sourceSchema}
        and con.contype = 'f';
    `;

    for (const constraint of sourceConstraints) {
      const targetTable = `${quotedTargetSchema}.${quoteIdent(constraint.table_name)}`;
      const definition = replaceSchemaInConstraint({
        definition: constraint.definition,
        sourceSchema,
        targetSchema,
      });
      await sql.unsafe(
        `alter table ${targetTable} add constraint ${quoteIdent(
          constraint.constraint_name
        )} ${definition};`
      );
    }

    await sql.unsafe("set session_replication_role = replica;");
    for (const { table_name } of tables) {
      const sourceTable = `${quotedSourceSchema}.${quoteIdent(table_name)}`;
      const targetTable = `${quotedTargetSchema}.${quoteIdent(table_name)}`;
      await sql.unsafe(
        `insert into ${targetTable} select * from ${sourceTable};`
      );
    }
    await sql.unsafe("set session_replication_role = origin;");

    console.info(
      `Migration complete: ${sourceSchema} -> ${targetSchema} (tables: ${tables.length}).`
    );
  } finally {
    try {
      await sql.close();
    } catch (err) {
      void err;
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown error during migration."
  );
  process.exit(1);
});
