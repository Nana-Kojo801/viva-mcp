import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

export class ConfigError extends Error {}

export function db(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new ConfigError("TURSO_DATABASE_URL is not set.");
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return client;
}

export function newId(): string {
  return crypto.randomUUID();
}

let schemaReady: Promise<void> | null = null;

/** Apply the idempotent schema once per server instance, so a fresh database works without running db:setup. */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const { SCHEMA, ADDED_COLUMNS } = await import("./schema");
    await db().batch(SCHEMA, "write");
    for (const { table, column, type } of ADDED_COLUMNS) {
      const cols = await db().execute(`PRAGMA table_info(${table})`);
      if (!cols.rows.some((r) => r.name === column)) {
        try {
          await db().execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        } catch (err) {
          // Another instance may have added it at the same moment.
          if (!/duplicate column/i.test(String(err))) throw err;
        }
      }
    }
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}
