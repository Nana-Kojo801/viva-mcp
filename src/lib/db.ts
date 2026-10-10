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
    const { SCHEMA } = await import("./schema");
    await db().batch(SCHEMA, "write");
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}
