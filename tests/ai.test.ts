import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.TURSO_DATABASE_URL = ":memory:";
process.env.OPENAI_API_KEY = "test";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const { db } = await import("../src/lib/db");
const { SCHEMA } = await import("../src/lib/schema");
const { gradeAnswer, AiError } = await import("../src/lib/ai");

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const card = { front: "What is equilibrium price?", back: "Where quantity demanded equals quantity supplied." };

beforeAll(async () => {
  for (const s of SCHEMA) await db().execute(s);
});

describe("gradeAnswer", () => {
  it("returns validated output", async () => {
    create.mockResolvedValueOnce(reply(JSON.stringify({ verdict: "correct", feedback: "Nice work.", missing_points: [] })));
    await expect(gradeAnswer(card, "where supply meets demand", "u1")).resolves.toMatchObject({ verdict: "correct" });
  });

  it("retries once on invalid output", async () => {
    create
      .mockResolvedValueOnce(reply("not json"))
      .mockResolvedValueOnce(reply(JSON.stringify({ verdict: "partial", feedback: "Close.", missing_points: ["supply side"] })));
    await expect(gradeAnswer(card, "when demand is high", "u2")).resolves.toMatchObject({ verdict: "partial" });
  });

  it("gives up with an AiError after two bad outputs", async () => {
    create.mockResolvedValueOnce(reply("{}")).mockResolvedValueOnce(reply(JSON.stringify({ verdict: "maybe" })));
    await expect(gradeAnswer(card, "uh", "u3")).rejects.toBeInstanceOf(AiError);
  });
});
