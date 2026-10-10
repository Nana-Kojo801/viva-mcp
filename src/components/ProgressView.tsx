"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CountUp, Tally } from "./Bits";
import { ArrowIcon, CalendarIcon } from "./Icons";
import { LedgerSkeleton } from "./Loading";
import { examLabel } from "@/lib/dates";
import { callTool, ToolError, type Deck, type ListDecks, type Progress } from "@/lib/client/mcp";

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export function ProgressView() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callTool<ListDecks>("list_decks").then(
      (r) => setDecks(r.decks),
      () => {},
    );
  }, []);

  useEffect(() => {
    setError(null);
    setP(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    callTool<Progress>("get_progress", { timezone, ...(deckId ? { deck_id: deckId } : {}) })
      .then(setP)
      .catch((e: unknown) => setError(e instanceof ToolError ? e.message : "Can't load progress. Reload the page."));
  }, [deckId]);

  const exams = decks
    .filter((d) => (deckId ? d.id === deckId : true))
    .map((d) => ({ d, label: examLabel(d.exam_date) }))
    .filter((x): x is { d: Deck; label: string } => !!x.label);
  const maxDay = p ? Math.max(1, ...p.week.map((d) => d.correct + d.partial + d.incorrect)) : 1;

  return (
    <div className="page">
      <header className="page-head rise">
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
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!p && !error && <LedgerSkeleton />}

      {p && (
        <>
          <section className="stats rise" aria-label="Summary">
            <p className="stat">
              <span className="stat-num">
                <CountUp value={p.streak_days} />
              </span>
              <span className="stat-label">{p.streak_days === 1 ? "day streak" : "day streak"}</span>
            </p>
            <p className="stat">
              <span className="stat-num">
                <CountUp value={p.due_today} />
              </span>
              <span className="stat-label">due today</span>
            </p>
            <p className="stat">
              <span className="stat-num">
                {p.accuracy_7d == null ? "–" : <CountUp value={p.accuracy_7d * 100} format={(n) => `${Math.round(n)}%`} />}
              </span>
              <span className="stat-label">right this week</span>
            </p>
          </section>

          {exams.length > 0 && (
            <ul className="exam-list rise" style={{ ["--d" as string]: "60ms" }}>
              {exams.map(({ d, label }) => (
                <li key={d.id}>
                  <CalendarIcon className="chip-icon" />
                  <span>
                    <strong>{label}</strong> · {d.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {p.due_today > 0 && (
            <p className="rise" style={{ ["--d" as string]: "80ms" }}>
              <Link className="button" href={deckId ? `/?deck=${deckId}` : "/"} transitionTypes={["nav-back"]}>
                Review {p.due_today} {p.due_today === 1 ? "card" : "cards"}
                <ArrowIcon className="button-icon" />
              </Link>
            </p>
          )}

          <section className="rise" style={{ ["--d" as string]: "120ms" }} aria-labelledby="week-title">
            <h2 id="week-title" className="section-title">
              This week
            </h2>
            <p className="muted small">One stroke for each correct answer. The line underneath shows everything you answered.</p>
            {p.reviewed_7d === 0 ? (
              <div className="empty">
                <p className="empty-title">Your tally starts with your first answer.</p>
                <Link className="text-button" href="/" transitionTypes={["nav-back"]}>
                  Start a quiz
                </Link>
              </div>
            ) : (
              <ul className="ledger">
                {p.week.map((d, i) => {
                  const total = d.correct + d.partial + d.incorrect;
                  return (
                    <li key={d.day} className="ledger-row" style={{ ["--i" as string]: i }}>
                      <span className="ledger-day">{weekday(d.day)}</span>
                      <span className="ledger-marks">
                        <Tally count={d.correct} delay={250 + i * 90} />
                        <span className="ledger-volume" aria-hidden="true">
                          <span className="vol-correct" style={{ width: `${(d.correct / maxDay) * 100}%` }} />
                          <span className="vol-partial" style={{ width: `${(d.partial / maxDay) * 100}%` }} />
                          <span className="vol-incorrect" style={{ width: `${(d.incorrect / maxDay) * 100}%` }} />
                        </span>
                      </span>
                      <span className={`ledger-count${total === 0 ? " ledger-zero" : ""}`}>
                        {total === 0 ? "–" : d.correct}
                        <span className="visually-hidden"> correct</span>
                        {total > d.correct && <span className="ledger-miss"> of {total}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rise" style={{ ["--d" as string]: "180ms" }} aria-labelledby="weak-title">
            <h2 id="weak-title" className="section-title">
              Weakest topics
            </h2>
            {p.weak_topics.length === 0 ? (
              <p className="muted">Nothing weak yet. Topics you miss will show up here.</p>
            ) : (
              <ol className="weak-list">
                {p.weak_topics.map((t, i) => (
                  <li key={t.topic} style={{ ["--i" as string]: i }}>
                    <span className="weak-topic">{t.topic}</span>
                    <span className="weak-meta">
                      {fmt(t.misses)} of {t.attempts} missed
                    </span>
                    <span className="weak-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(t.miss_rate * 100)}%` }} />
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
