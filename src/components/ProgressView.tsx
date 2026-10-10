"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CountUp, Tally } from "./Bits";
import { ArrowIcon, CalendarIcon } from "./Icons";
import { LedgerSkeleton } from "./Loading";
import { examLabel } from "@/lib/dates";
import { callTool, peekTool, ToolError, type Deck, type ListDecks, type Progress } from "@/lib/client/mcp";

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

export function ProgressView() {
  const [decks, setDecks] = useState<Deck[]>(() => peekTool<ListDecks>("list_decks")?.decks ?? []);
  const [deckId, setDeckId] = useState("");
  const [p, setP] = useState<Progress | null>(null);
  // With cached data the page slide is the whole entrance; sections only fade in when they replace a skeleton.
  const [instant] = useState(() => !!peekTool<Progress>("get_progress", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  const rise = instant ? "" : " rise";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callTool<ListDecks>("list_decks").then(
      (r) => setDecks(r.decks),
      () => {},
    );
  }, []);

  useEffect(() => {
    setError(null);
    const args = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(deckId ? { deck_id: deckId } : {}) };
    setP(peekTool<Progress>("get_progress", args) ?? null);
    callTool<Progress>("get_progress", args)
      .then(setP)
      .catch((e: unknown) => setError(e instanceof ToolError ? e.message : "Can't load progress. Reload the page."));
  }, [deckId]);

  const exams = decks
    .filter((d) => (deckId ? d.id === deckId : true))
    .map((d) => ({ d, label: examLabel(d.exam_date) }))
    .filter((x): x is { d: Deck; label: string } => !!x.label);

  const todayKey = p?.week.at(-1)?.day;
  const tilts = ["-1.5deg", "1deg", "-0.5deg", "1.8deg", "-1deg", "0.8deg", "-1.4deg"];

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">this week.</h1>
        {decks.length > 1 && (
          <label className="field inline">
            <span>deck</span>
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
          <section className={`stats paper${rise}`} aria-label="Summary">
            <p className="stat">
              <span className="stat-num stat-pen">
                <CountUp value={p.streak_days} />
              </span>
              <span className="stat-label">day streak</span>
            </p>
            <p className="stat">
              <span className="stat-num stat-wrong">
                <CountUp value={p.due_today} />
              </span>
              <span className="stat-label">due today</span>
            </p>
            <p className="stat">
              <span className="stat-num stat-correct">
                {p.accuracy_7d == null ? "–" : <CountUp value={p.accuracy_7d * 100} format={(n) => `${Math.round(n)}%`} />}
              </span>
              <span className="stat-label">right this week</span>
            </p>
          </section>

          {exams.length > 0 && (
            <ul className={`exam-list${rise}`} style={{ ["--d" as string]: "60ms" }}>
              {exams.map(({ d, label }) => (
                <li key={d.id}>
                  <CalendarIcon className="chip-icon" />
                  <span>
                    <strong>{label.toLowerCase()}</strong> · {d.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <section className={rise.trim()} style={{ ["--d" as string]: "100ms" }} aria-labelledby="week-title">
            <h2 id="week-title" className="section-title">
              day by day
            </h2>
            {p.reviewed_7d === 0 ? (
              <div className="empty paper">
                <p className="empty-title">Your tally starts with your first answer.</p>
                <Link className="text-button" href="/" transitionTypes={["nav-back"]}>
                  start a quiz
                </Link>
              </div>
            ) : (
              <ul className="day-cards" aria-label="Correct answers per day">
                {p.week.map((d, i) => {
                  const total = d.correct + d.partial + d.incorrect;
                  const isToday = d.day === todayKey;
                  return (
                    <li
                      key={d.day}
                      className={`day-card${total === 0 ? " is-rest" : ""}${isToday ? " is-today" : ""}`}
                      style={{ ["--tilt" as string]: tilts[i], ["--i" as string]: i }}
                    >
                      <span className="day-name">{isToday ? "today" : weekday(d.day).toLowerCase()}</span>
                      {total === 0 ? (
                        <span className="day-rest">rest</span>
                      ) : (
                        <>
                          <Tally count={d.correct} delay={300 + i * 90} />
                          <span className="day-count">
                            {d.correct}
                            <span className="visually-hidden"> correct</span>
                            {total > d.correct && <span className="day-of"> of {total}</span>}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={rise.trim()} style={{ ["--d" as string]: "160ms" }} aria-labelledby="weak-title">
            <h2 id="weak-title" className="section-title">
              weakest topics
            </h2>
            {p.weak_topics.length === 0 ? (
              <p className="muted">Nothing weak yet. Topics you miss will show up here.</p>
            ) : (
              <ol className="dividers">
                {p.weak_topics.map((t, i) => (
                  <li key={t.topic} style={{ ["--i" as string]: i }}>
                    <span className="divider-title">{t.topic}</span>
                    <span className={`divider-meta${t.miss_rate >= 0.4 ? " is-bad" : ""}`}>
                      {fmt(t.misses)} of {t.attempts} missed
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {p.due_today > 0 && (
            <p className={rise.trim()} style={{ ["--d" as string]: "200ms" }}>
              <Link className="button button-wide" href={deckId ? `/?deck=${deckId}` : "/"} transitionTypes={["nav-back"]}>
                review {p.due_today} {p.due_today === 1 ? "card" : "cards"}
                <ArrowIcon className="button-icon" />
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
