import type { Row } from "@libsql/client";
import type { CardDraft } from "./ai";
import { db, newId } from "./db";
import { SEED_CARDS, SEED_DECK_TITLE } from "./seed";
import { DAY_MS, review, type Verdict } from "./sm2";

export type Card = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  topic: string;
  source_excerpt: string;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: number;
  hints: string[] | null;
  explanation: string | null;
  parent_card_id: string | null;
};

export type DeckSummary = {
  id: string;
  title: string;
  exam_date: string | null;
  card_count: number;
  due_count: number;
};

const ensured = new Set<string>();

/** Create the user on first sight and give them their own copy of the demo deck. */
export async function ensureUser(userId: string): Promise<void> {
  if (ensured.has(userId)) return;
  const now = Date.now();
  const rs = await db().execute({
    sql: "INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)",
    args: [userId, now],
  });
  if (rs.rowsAffected > 0) await createDeck(userId, SEED_DECK_TITLE, null, SEED_CARDS, now);
  ensured.add(userId);
}

export async function createDeck(
  userId: string,
  title: string,
  examDate: string | null,
  drafts: CardDraft[],
  now = Date.now(),
): Promise<{ deckId: string; cards: Card[] }> {
  const deckId = newId();
  const cards: Card[] = drafts.map((d) => ({
    id: newId(),
    deck_id: deckId,
    front: d.front,
    back: d.back,
    topic: d.topic,
    source_excerpt: d.source_excerpt,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    due_at: now,
    hints: null,
    explanation: null,
    parent_card_id: null,
  }));
  await db().batch(
    [
      {
        sql: "INSERT INTO decks (id, user_id, title, exam_date, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [deckId, userId, title, examDate, now],
      },
      ...cards.map((c, i) => ({
        sql: `INSERT INTO cards (id, deck_id, user_id, front, back, topic, source_excerpt, due_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        // Stagger due_at by a millisecond (into the past, so all are due now) to keep the order they were written in.
        args: [c.id, deckId, userId, c.front, c.back, c.topic, c.source_excerpt, now - cards.length + i, now],
      })),
    ],
    "write",
  );
  cards.forEach((c, i) => (c.due_at = now - cards.length + i));
  return { deckId, cards };
}

export async function listDecks(userId: string, now = Date.now()): Promise<DeckSummary[]> {
  const rs = await db().execute({
    sql: `SELECT d.id, d.title, d.exam_date,
                 COUNT(c.id) AS card_count,
                 COALESCE(SUM(CASE WHEN c.due_at <= ? THEN 1 ELSE 0 END), 0) AS due_count
          FROM decks d LEFT JOIN cards c ON c.deck_id = d.id
          WHERE d.user_id = ?
          GROUP BY d.id
          ORDER BY d.created_at DESC`,
    args: [now, userId],
  });
  return rs.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    exam_date: r.exam_date == null ? null : String(r.exam_date),
    card_count: Number(r.card_count),
    due_count: Number(r.due_count),
  }));
}

export async function getDeck(userId: string, deckId: string): Promise<{ id: string; title: string } | null> {
  const rs = await db().execute({
    sql: "SELECT id, title FROM decks WHERE id = ? AND user_id = ?",
    args: [deckId, userId],
  });
  const r = rs.rows[0];
  return r ? { id: String(r.id), title: String(r.title) } : null;
}

function toCard(r: Row): Card {
  return {
    id: String(r.id),
    deck_id: String(r.deck_id),
    front: String(r.front),
    back: String(r.back),
    topic: String(r.topic),
    source_excerpt: String(r.source_excerpt),
    ease: Number(r.ease),
    interval_days: Number(r.interval_days),
    repetitions: Number(r.repetitions),
    lapses: Number(r.lapses),
    due_at: Number(r.due_at),
    hints: parseHints(r.hints),
    explanation: r.explanation == null ? null : String(r.explanation),
    parent_card_id: r.parent_card_id == null ? null : String(r.parent_card_id),
  };
}

function parseHints(v: unknown): string[] | null {
  if (v == null) return null;
  try {
    const h = JSON.parse(String(v));
    return Array.isArray(h) && h.every((x) => typeof x === "string") ? h : null;
  } catch {
    return null;
  }
}

export async function getCard(userId: string, cardId: string): Promise<Card | null> {
  const rs = await db().execute({ sql: "SELECT * FROM cards WHERE id = ? AND user_id = ?", args: [cardId, userId] });
  return rs.rows[0] ? toCard(rs.rows[0]) : null;
}

/** How many days ahead an exam starts to pull weak topics forward. */
export const EXAM_WINDOW_DAYS = 21;

/**
 * Pick the next card. Order of preference:
 * 1. an easier prerequisite card added by explain_again, until it is first answered,
 * 2. when a deck's exam is within EXAM_WINDOW_DAYS, due cards from the user's weakest topics,
 *    weighted more heavily the closer the exam is,
 * 3. otherwise the most overdue card.
 * With `ahead`, the soonest card even if it is not due yet. `exclude` skips cards passed over this session.
 */
export async function nextCard(
  userId: string,
  opts: { deckId?: string; ahead?: boolean; exclude?: string[] } = {},
  now = Date.now(),
): Promise<{ card: Card | null; dueRemaining: number; nextDueAt: number | null; reason: "prerequisite" | "exam_focus" | "due" | "ahead" | null }> {
  const exclude = (opts.exclude ?? []).slice(0, 200);
  const where = ["c.user_id = ?"];
  const args: (string | number)[] = [userId];
  if (opts.deckId) {
    where.push("c.deck_id = ?");
    args.push(opts.deckId);
  }
  if (exclude.length) {
    where.push(`c.id NOT IN (${exclude.map(() => "?").join(",")})`);
    args.push(...exclude);
  }
  const base = where.join(" AND ");
  const [candidates, counts, misses] = await db().batch(
    [
      {
        sql: `SELECT c.*, d.exam_date FROM cards c JOIN decks d ON d.id = c.deck_id
              WHERE ${base} ${opts.ahead ? "" : "AND c.due_at <= ?"} ORDER BY c.due_at ASC LIMIT 60`,
        args: opts.ahead ? args : [...args, now],
      },
      {
        sql: `SELECT COALESCE(SUM(CASE WHEN c.due_at <= ? THEN 1 ELSE 0 END), 0) AS due, MIN(c.due_at) AS next_due FROM cards c WHERE ${base}`,
        args: [now, ...args],
      },
      {
        sql: `SELECT c.topic,
                     SUM(CASE r.verdict WHEN 'incorrect' THEN 1.0 WHEN 'partial' THEN 0.5 ELSE 0 END) / COUNT(*) AS miss_rate
              FROM reviews r JOIN cards c ON c.id = r.card_id
              WHERE r.user_id = ? AND r.created_at >= ?
              GROUP BY c.topic`,
        args: [userId, now - 14 * DAY_MS],
      },
    ],
    "read",
  );
  const c = counts.rows[0];
  const result = (card: Card | null, reason: "prerequisite" | "exam_focus" | "due" | "ahead" | null) => ({
    card,
    dueRemaining: Number(c?.due ?? 0),
    nextDueAt: c?.next_due == null ? null : Number(c.next_due),
    reason,
  });
  if (!candidates.rows.length) return result(null, null);
  if (opts.ahead) return result(toCard(candidates.rows[0]), "ahead");

  // Prerequisites jump the queue only until they are first answered.
  const prereq = candidates.rows.find((r) => r.parent_card_id != null && Number(r.repetitions) === 0 && Number(r.lapses) === 0);
  if (prereq) return result(toCard(prereq), "prerequisite");

  const missRate = new Map(misses.rows.map((r) => [String(r.topic), Number(r.miss_rate)]));
  let best: { row: (typeof candidates.rows)[number]; score: number } | null = null;
  for (const row of candidates.rows) {
    const urgency = examUrgency(row.exam_date == null ? null : String(row.exam_date), now);
    const score = urgency * (missRate.get(String(row.topic)) ?? 0);
    if (score > 0 && (!best || score > best.score)) best = { row, score };
  }
  if (best) return result(toCard(best.row), "exam_focus");
  return result(toCard(candidates.rows[0]), "due");
}

/** 0 when there is no exam in the window, rising to 1 on exam day. */
export function examUrgency(examDate: string | null, now = Date.now()): number {
  const days = daysUntil(examDate, now);
  if (days == null || days < 0 || days > EXAM_WINDOW_DAYS) return 0;
  return 1 - days / (EXAM_WINDOW_DAYS + 1);
}

/** Whole days from today (UTC) until an ISO date. Null when there is no date. */
export function daysUntil(isoDate: string | null, now = Date.now()): number | null {
  if (!isoDate) return null;
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / DAY_MS);
}

export async function saveHints(userId: string, cardId: string, hints: string[]): Promise<void> {
  await db().execute({
    sql: "UPDATE cards SET hints = ? WHERE id = ? AND user_id = ?",
    args: [JSON.stringify(hints), cardId, userId],
  });
}

export async function lastAnswer(userId: string, cardId: string): Promise<string | null> {
  const rs = await db().execute({
    sql: "SELECT user_answer FROM reviews WHERE user_id = ? AND card_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [userId, cardId],
  });
  return rs.rows[0] ? String(rs.rows[0].user_answer) : null;
}

/** The prerequisite card already made for a card, if any. */
export async function prerequisiteOf(userId: string, cardId: string): Promise<Card | null> {
  const rs = await db().execute({
    sql: "SELECT * FROM cards WHERE user_id = ? AND parent_card_id = ? ORDER BY created_at ASC LIMIT 1",
    args: [userId, cardId],
  });
  return rs.rows[0] ? toCard(rs.rows[0]) : null;
}

/** Store a re-explanation and add the easier prerequisite card, due right away. */
export async function saveExplanation(
  userId: string,
  card: Card,
  explanation: string,
  prereq: CardDraft,
  now = Date.now(),
): Promise<Card> {
  const id = newId();
  await db().batch(
    [
      { sql: "UPDATE cards SET explanation = ? WHERE id = ? AND user_id = ?", args: [explanation, card.id, userId] },
      {
        sql: `INSERT INTO cards (id, deck_id, user_id, front, back, topic, source_excerpt, due_at, created_at, parent_card_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, card.deck_id, userId, prereq.front, prereq.back, card.topic, prereq.source_excerpt, now, now, card.id],
      },
    ],
    "write",
  );
  return {
    id,
    deck_id: card.deck_id,
    front: prereq.front,
    back: prereq.back,
    topic: card.topic,
    source_excerpt: prereq.source_excerpt,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    due_at: now,
    hints: null,
    explanation: null,
    parent_card_id: card.id,
  };
}

export async function recordReview(
  userId: string,
  card: Card,
  verdict: Verdict,
  quality: number,
  answer: string,
  now = Date.now(),
): Promise<Card> {
  const next = review(card, quality, now);
  await db().batch(
    [
      {
        sql: `UPDATE cards SET ease = ?, interval_days = ?, repetitions = ?, lapses = ?, due_at = ?
              WHERE id = ? AND user_id = ?`,
        args: [next.ease, next.interval_days, next.repetitions, next.lapses, next.due_at, card.id, userId],
      },
      {
        sql: `INSERT INTO reviews (id, card_id, user_id, verdict, quality, user_answer, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [newId(), card.id, userId, verdict, quality, answer.slice(0, 1000), now],
      },
    ],
    "write",
  );
  return { ...card, ...next };
}

export async function setExamDate(userId: string, deckId: string, date: string | null): Promise<boolean> {
  const rs = await db().execute({
    sql: "UPDATE decks SET exam_date = ? WHERE id = ? AND user_id = ?",
    args: [date, deckId, userId],
  });
  return rs.rowsAffected > 0;
}

export async function deleteCard(userId: string, cardId: string): Promise<boolean> {
  const rs = await db().execute({ sql: "DELETE FROM cards WHERE id = ? AND user_id = ?", args: [cardId, userId] });
  return rs.rowsAffected > 0;
}

// ---------- progress ----------

export type Progress = {
  streak_days: number;
  due_today: number;
  reviewed_7d: number;
  accuracy_7d: number | null; // 0..1, partial answers count half
  week: { day: string; correct: number; partial: number; incorrect: number }[];
  weak_topics: { topic: string; misses: number; attempts: number; miss_rate: number }[];
};

function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

/** Last millisecond of the local day containing `now` in `timeZone`. */
export function endOfDay(now: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const sinceMidnight = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + (now % 1000);
  return now - sinceMidnight + DAY_MS - 1;
}

export function safeTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function progress(
  userId: string,
  opts: { deckId?: string; timeZone?: string } = {},
  now = Date.now(),
): Promise<Progress> {
  const tz = safeTimeZone(opts.timeZone);
  const deckFilter = opts.deckId ? "AND c.deck_id = ?" : "";
  const deckArgs = opts.deckId ? [opts.deckId] : [];
  const since = now - 60 * DAY_MS;

  const [reviews, due] = await db().batch(
    [
      {
        sql: `SELECT r.verdict, r.created_at, c.topic FROM reviews r JOIN cards c ON c.id = r.card_id
              WHERE r.user_id = ? AND r.created_at >= ? ${deckFilter} ORDER BY r.created_at DESC`,
        args: [userId, since, ...deckArgs],
      },
      {
        sql: `SELECT COUNT(*) AS n FROM cards c WHERE c.user_id = ? AND c.due_at <= ? ${deckFilter}`,
        args: [userId, endOfDay(now, tz), ...deckArgs],
      },
    ],
    "read",
  );

  const week: Progress["week"] = [];
  for (let i = 6; i >= 0; i--) week.push({ day: dayKey(now - i * DAY_MS, tz), correct: 0, partial: 0, incorrect: 0 });
  const weekIndex = new Map(week.map((w, i) => [w.day, i]));

  const activeDays = new Set<string>();
  const topics = new Map<string, { misses: number; attempts: number }>();
  let score = 0;
  let reviewed = 0;

  for (const r of reviews.rows) {
    const verdict = String(r.verdict) as Verdict;
    const at = Number(r.created_at);
    const key = dayKey(at, tz);
    activeDays.add(key);

    const i = weekIndex.get(key);
    if (i !== undefined) {
      week[i][verdict] += 1;
      reviewed += 1;
      score += verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0;
    }
    if (now - at <= 14 * DAY_MS) {
      const t = topics.get(String(r.topic)) ?? { misses: 0, attempts: 0 };
      t.attempts += 1;
      if (verdict === "incorrect") t.misses += 1;
      else if (verdict === "partial") t.misses += 0.5;
      topics.set(String(r.topic), t);
    }
  }

  // Streak: consecutive days with a review, ending today (or yesterday, if not studied yet today).
  let streak = 0;
  let cursor = now;
  if (!activeDays.has(dayKey(cursor, tz))) cursor -= DAY_MS;
  while (activeDays.has(dayKey(cursor, tz))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  const weak_topics = [...topics.entries()]
    .filter(([, t]) => t.misses > 0)
    .map(([topic, t]) => ({ topic, misses: t.misses, attempts: t.attempts, miss_rate: t.misses / t.attempts }))
    .sort((a, b) => b.miss_rate - a.miss_rate || b.misses - a.misses)
    .slice(0, 5);

  return {
    streak_days: streak,
    due_today: Number(due.rows[0]?.n ?? 0),
    reviewed_7d: reviewed,
    accuracy_7d: reviewed ? score / reviewed : null,
    week,
    weak_topics,
  };
}
