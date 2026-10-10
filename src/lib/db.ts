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
