import { beforeAll, describe, expect, it } from "vitest";

process.env.TURSO_DATABASE_URL = ":memory:";
process.env.AI_DAILY_CALL_CAP = "3";
process.env.AI_SESSION_DAILY_CAP = "2";

const { db } = await import("../src/lib/db");
const { SCHEMA } = await import("../src/lib/schema");
const { spendAiCall, BudgetError } = await import("../src/lib/budget");
const { chunkNotes, CHUNK_CHARS, MAX_NOTES_CHARS } = await import("../src/lib/ai");

beforeAll(async () => {
  for (const s of SCHEMA) await db().execute(s);
});

describe("spendAiCall", () => {
  it("enforces the per-user cap", async () => {
    await spendAiCall("a");
    await spendAiCall("a");
    await expect(spendAiCall("a")).rejects.toBeInstanceOf(BudgetError);
  });

  it("enforces the global cap and does not leak a refused user call", async () => {
    await spendAiCall("b"); // global now 3
    await expect(spendAiCall("c")).rejects.toBeInstanceOf(BudgetError);
  });
});

describe("chunkNotes", () => {
  it("keeps short notes whole", () => {
    expect(chunkNotes("  short notes  ")).toEqual(["short notes"]);
  });

  it("splits long notes under the chunk size and caps total input", () => {
    const para = "Sentence about markets. ".repeat(40);
    const chunks = chunkNotes(Array(100).fill(para).join("\n\n"));
    expect(chunks.every((c) => c.length <= CHUNK_CHARS)).toBe(true);
    expect(chunks.join("").length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
  });
});
