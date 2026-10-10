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

describe("next card selection", () => {
  it("puts an unanswered prerequisite first, then schedules it normally", async () => {
    await store.ensureUser("p1");
    const first = (await store.nextCard("p1")).card!;
    const missed = (await store.nextCard("p1", { exclude: [first.id] })).card!;
    const prereq = await store.saveExplanation("p1", missed, "Think of it like this.", {
      front: "What is a market?",
      back: "A place where buyers and sellers trade.",
      topic: "x",
      source_excerpt: "buyers and sellers",
    });
    const pick = await store.nextCard("p1");
    expect(pick.card?.id).toBe(prereq.id);
    expect(pick.reason).toBe("prerequisite");
    expect((await store.prerequisiteOf("p1", missed.id))?.id).toBe(prereq.id);

    await store.recordReview("p1", pick.card!, "correct", 5, "a place to trade");
    const after = await store.nextCard("p1");
    expect(after.card?.id).not.toBe(prereq.id);
  });

  it("pulls weak topics forward when an exam is close", async () => {
    await store.ensureUser("e1");
    const [deck] = await store.listDecks("e1");
    // Miss an elasticity card so that topic becomes the weakest.
    const all: Awaited<ReturnType<typeof store.nextCard>>["card"][] = [];
    const seen: string[] = [];
    for (;;) {
      const c = (await store.nextCard("e1", { exclude: seen })).card;
      if (!c) break;
      seen.push(c.id);
      all.push(c);
    }
    const elastic = all.filter((c) => c!.topic === "Elasticity");
    await store.recordReview("e1", elastic[0]!, "incorrect", 1, "no idea");

    expect((await store.nextCard("e1")).reason).toBe("due"); // no exam yet: plain due order

    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await store.setExamDate("e1", deck.id, soon);
    const pick = await store.nextCard("e1");
    expect(pick.reason).toBe("exam_focus");
    expect(pick.card?.topic).toBe("Elasticity");
  });
});

describe("daysUntil and examUrgency", () => {
  const now = Date.parse("2026-10-10T15:00:00Z");
  it("counts whole days", () => {
    expect(store.daysUntil("2026-10-10", now)).toBe(0);
    expect(store.daysUntil("2026-10-17", now)).toBe(7);
    expect(store.daysUntil(null, now)).toBeNull();
  });
  it("rises as the exam gets closer and is zero outside the window", () => {
    expect(store.examUrgency("2026-12-31", now)).toBe(0);
    expect(store.examUrgency("2026-10-09", now)).toBe(0);
    expect(store.examUrgency("2026-10-11", now)).toBeGreaterThan(store.examUrgency("2026-10-20", now));
  });
});
