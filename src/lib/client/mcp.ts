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
};
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
