import { beforeAll, describe, expect, it } from "vitest";

process.env.TURSO_DATABASE_URL = ":memory:";

const { ensureSchema } = await import("../src/lib/db");
const store = await import("../src/lib/store");
const { SEED_CARDS } = await import("../src/lib/seed");

beforeAll(async () => {
  await ensureSchema();
});

describe("store", () => {
  it("gives a new user the whole demo deck, due now, in order", async () => {
    await store.ensureUser("s1");
    const [deck] = await store.listDecks("s1");
    expect(deck.card_count).toBe(SEED_CARDS.length);
    expect(deck.due_count).toBe(SEED_CARDS.length);
    const { card } = await store.nextCard("s1");
    expect(card?.front).toBe(SEED_CARDS[0].front);
  });

  it("brings a wrong answer back sooner than a right one", async () => {
    await store.ensureUser("s2");
    const a = (await store.nextCard("s2")).card!;
    const b = (await store.nextCard("s2", { exclude: [a.id] })).card!;
    const wrong = await store.recordReview("s2", a, "incorrect", 1, "no idea");
    const right = await store.recordReview("s2", b, "correct", 5, "right answer");
    expect(wrong.due_at).toBeLessThan(right.due_at);
    const p = await store.progress("s2");
    expect(p.reviewed_7d).toBe(2);
    expect(p.accuracy_7d).toBe(0.5);
    expect(p.week.at(-1)?.correct).toBe(1);
  });

  it("keeps users' data apart", async () => {
    await store.ensureUser("s3");
    const card = (await store.nextCard("s3")).card!;
    expect(await store.getCard("s1", card.id)).toBeNull();
    expect(await store.deleteCard("s1", card.id)).toBe(false);
  });
});
