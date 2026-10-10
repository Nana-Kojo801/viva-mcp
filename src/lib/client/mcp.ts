"use client";

// The web app talks to Viva only through the MCP endpoint, using the official MCP client,
// exactly as an Alexa+ device or any other MCP client would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getUserId } from "./user";

export class ToolError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

let connecting: Promise<Client> | null = null;

function connect(): Promise<Client> {
  connecting ??= (async () => {
    const client = new Client({ name: "viva-web-sim", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", location.origin), {
      requestInit: { headers: { "x-viva-user": getUserId() } },
    });
    await client.connect(transport);
    return client;
  })().catch((err) => {
    connecting = null;
    throw err;
  });
  return connecting;
}

const NETWORK = "Can't reach Viva. Check your connection and try again.";

// Last result of read-only tools, so screens can draw instantly and refresh in the background.
const CACHED = new Set(["list_decks", "get_study_nudge", "get_progress"]);
const WRITES = new Set(["add_material", "submit_answer", "set_exam_date", "delete_card", "explain_again"]);
const cache = new Map<string, unknown>();
const key = (name: string, args: Record<string, unknown>) => `${name}:${JSON.stringify(args)}`;

/** The last result of a read-only tool call with these exact arguments, if any. */
export function peekTool<T>(name: string, args: Record<string, unknown> = {}): T | undefined {
  return cache.get(key(name, args)) as T | undefined;
}

/** Warm the connection and the cache for a screen before the user opens it. */
export function prefetchTools(calls: [string, Record<string, unknown>?][]): void {
  for (const [name, args = {}] of calls) void callTool(name, args).catch(() => {});
}

export async function callTool<T extends { spoken: string }>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  let client: Client;
  try {
    client = await connect();
  } catch {
    throw new ToolError(NETWORK, "network");
  }
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (err) {
    console.error(`[viva] ${name} failed`, err);
    throw new ToolError(NETWORK, "network");
  }
  if (result.isError) {
    const text = (result.content as { type: string; text?: string }[])[0]?.text ?? "Something went wrong.";
    const code = String((result._meta as Record<string, unknown> | undefined)?.["viva/error"] ?? "error");
    throw new ToolError(text, code);
  }
  if (CACHED.has(name)) cache.set(key(name, args), result.structuredContent);
  else if (WRITES.has(name)) cache.clear(); // writes may change decks, due counts or progress
  return result.structuredContent as T;
}

// Shapes of the structured tool results the web app uses.
export type Deck = { id: string; title: string; exam_date: string | null; card_count: number; due_count: number };
export type ListDecks = { spoken: string; decks: Deck[] };
export type NextCard = {
  spoken: string;
  card: { id: string; front: string; topic: string; deck_id: string } | null;
  due_remaining: number;
  next_due_at: number | null;
  reason: "prerequisite" | "exam_focus" | "due" | "ahead" | null;
};
export type Verdict = "correct" | "partial" | "incorrect";
export type SubmitAnswer = {
  spoken: string;
  verdict: Verdict;
  feedback: string;
  correct_answer: string | null;
  missing_points: string[];
  quality: number;
  next_review_at: number;
  lapses: number;
  suggest_explain: boolean;
};
export type Hint = { spoken: string; card_id: string; level: number; hint: string; has_more: boolean };
export type Explain = { spoken: string; card_id: string; explanation: string; prerequisite_card: { id: string; front: string } | null };
export type Nudge = {
  spoken: string;
  nudge: string;
  exam: { deck_id: string; deck_title: string; date: string; days_left: number } | null;
  due_today: number;
  streak_days: number;
  focus_topic: string | null;
};
export type NotesPhoto = { spoken: string; text: string; characters: number };
export type AddMaterial = {
  spoken: string;
  deck_id: string;
  title: string;
  card_count: number;
  topics: string[];
  truncated: boolean;
  cards: { id: string; front: string; back: string; topic: string }[];
};
export type Progress = {
  spoken: string;
  streak_days: number;
  due_today: number;
  reviewed_7d: number;
  accuracy_7d: number | null;
  week: { day: string; correct: number; partial: number; incorrect: number }[];
  weak_topics: { topic: string; misses: number; attempts: number; miss_rate: number }[];
};
