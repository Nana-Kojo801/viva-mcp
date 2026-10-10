"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LedgerSkeleton } from "./Loading";
import { Tally } from "./Tally";
import { callTool, ToolError, type Deck, type ListDecks, type Progress } from "@/lib/client/mcp";

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export function ProgressView() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callTool<ListDecks>("list_decks").then((r) => setDecks(r.decks), () => {});
  }, []);

  useEffect(() => {
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    callTool<Progress>("get_progress", { timezone, ...(deckId ? { deck_id: deckId } : {}) })
      .then(setP)
      .catch((e: unknown) => setError(e instanceof ToolError ? e.message : "Can't load progress. Reload the page."));
  }, [deckId]);

  return (
    <div className="page">
      <h1 className="page-title">Progress</h1>
      {decks.length > 1 && (
        <label className="field inline">
          <span>Deck</span>
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            <option value="">All decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!p && !error && <LedgerSkeleton />}

      {p && (
        <>
          <p className="summary">
            {p.streak_days > 0 ? `${p.streak_days}-day streak. ` : "No streak yet. "}
            {p.due_today} {p.due_today === 1 ? "card" : "cards"} due today.
            {p.accuracy_7d != null ? ` ${Math.round(p.accuracy_7d * 100)}% right this week.` : ""}
          </p>
          {p.due_today > 0 && (
            <p>
              <Link className="button" href={deckId ? `/?deck=${deckId}` : "/"}>
                Start quiz
              </Link>
            </p>
          )}

          <section aria-labelledby="week-title">
            <h2 id="week-title" className="section-title">
              This week
            </h2>
            <p className="muted small">One stroke for each correct answer.</p>
            <ul className="ledger">
              {p.week.map((d) => (
                <li key={d.day} className="ledger-row">
                  <span className="ledger-day">{weekday(d.day)}</span>
                  <Tally count={d.correct} />
                  <span className="ledger-count">
                    {d.correct}
                    <span className="visually-hidden"> correct</span>
                    {d.partial + d.incorrect > 0 && <span className="ledger-miss"> of {d.correct + d.partial + d.incorrect}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="weak-title">
            <h2 id="weak-title" className="section-title">
              Weakest topics
            </h2>
            {p.weak_topics.length === 0 ? (
              <p className="muted">Nothing weak yet. Topics you miss will show up here.</p>
            ) : (
              <ol className="weak-list">
                {p.weak_topics.map((t) => (
                  <li key={t.topic}>
                    <span className="weak-topic">{t.topic}</span>
                    <span className="weak-meta">
                      {fmt(t.misses)} of {t.attempts} missed
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
