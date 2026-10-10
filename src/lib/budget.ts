import { db } from "./db";

export class BudgetError extends Error {
  constructor() {
    super("Demo limit reached for today. Try again tomorrow, or keep reviewing cards you already have.");
  }
}

function cap(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function today(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

// Increment a counter only while it is below the cap. Returns false when the cap is hit.
async function take(day: string, scope: string, limit: number): Promise<boolean> {
  const rs = await db().execute({
    sql: `INSERT INTO usage (day, scope, calls) VALUES (?, ?, 1)
          ON CONFLICT(day, scope) DO UPDATE SET calls = calls + 1 WHERE calls < ?
          RETURNING calls`,
    args: [day, scope, limit],
  });
  return rs.rows.length > 0 && limit > 0;
}

async function giveBack(day: string, scope: string): Promise<void> {
  await db().execute({
    sql: "UPDATE usage SET calls = MAX(0, calls - 1) WHERE day = ? AND scope = ?",
    args: [day, scope],
  });
}

/** Check and increment the global and per-user daily AI budgets. Throws BudgetError when either is spent. */
export async function spendAiCall(userId: string): Promise<void> {
  const day = today();
  if (!(await take(day, "global", cap("AI_DAILY_CALL_CAP", 300)))) throw new BudgetError();
  if (!(await take(day, `user:${userId}`, cap("AI_SESSION_DAILY_CAP", 40)))) {
    await giveBack(day, "global");
    throw new BudgetError();
  }
}

/** Reserve `chars` from the global daily text-to-speech budget. Returns false when it would go over. */
export async function spendTtsChars(chars: number): Promise<boolean> {
  const limit = cap("TTS_DAILY_CHAR_CAP", 30_000);
  if (chars > limit) return false;
  const rs = await db().execute({
    sql: `INSERT INTO usage (day, scope, calls) VALUES (?, 'tts_chars', ?)
          ON CONFLICT(day, scope) DO UPDATE SET calls = calls + ? WHERE calls + ? <= ?
          RETURNING calls`,
    args: [today(), chars, chars, chars, limit],
  });
  return rs.rows.length > 0;
}
