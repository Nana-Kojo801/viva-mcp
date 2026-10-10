// Schema for Turso (libSQL). Every statement is idempotent so `npm run db:setup` can be re-run safely.
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    exam_date TEXT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    topic TEXT NOT NULL,
    source_excerpt TEXT NOT NULL DEFAULT '',
    ease REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER NOT NULL,
    lapses INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    quality INTEGER NOT NULL,
    user_answer TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS usage (
    day TEXT NOT NULL,
    scope TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, scope)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_user_due ON cards(user_id, due_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_user_time ON reviews(user_id, created_at)`,
];
