"use client";

import { useEffect, useState } from "react";

/** Quiz, waiting for a question: blank lines in the question face, with the highlighter looking for words. */
export function QuestionSkeleton({ label }: { label: string }) {
  return (
    <div className="q-skeleton" role="status">
      <div className="q-skeleton-lines" aria-hidden="true">
        <span style={{ width: "92%", animationDelay: "0s" }} />
        <span style={{ width: "74%", animationDelay: "0.8s" }} />
        <span style={{ width: "48%", animationDelay: "1.6s" }} />
      </div>
      <p className="loading-caption">{label}</p>
    </div>
  );
}

/** Quiz, grading: the examiner's pencil underlining the answer while it is being marked. */
export function MarkingLine({ label = "Marking your answer" }: { label?: string }) {
  return (
    <div className="marking" role="status">
      <svg viewBox="0 0 240 14" preserveAspectRatio="none" aria-hidden="true" className="marking-stroke">
        <path pathLength={1} d="M2 8 C 30 3, 52 12, 80 7 S 132 3, 160 8 S 210 12, 238 6" />
      </svg>
      <p className="loading-caption">{label}</p>
    </div>
  );
}

/** A short inline placeholder bar for a line of text that is still loading. */
export function LineSkeleton({ width = "12em", label }: { width?: string; label: string }) {
  return (
    <span className="line-skeleton" style={{ width }} role="status">
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

const WRITING_STEPS = ["Reading your notes", "Picking out the key ideas", "Writing questions you can answer aloud", "Checking each card"];

/** Notes, generating cards: a ruled page being written line by line. */
export function WritingCards() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, WRITING_STEPS.length - 1)), 4500);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="writing" role="status" aria-live="polite">
      <div className="writing-page" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="writing-line" style={{ animationDelay: `${i * 0.45}s`, ["--w" as string]: `${[88, 64, 92, 51, 80, 37][i]}%` }} />
        ))}
      </div>
      <p className="writing-step">{WRITING_STEPS[step]}…</p>
      <p className="muted small">This usually takes 10 to 30 seconds.</p>
    </div>
  );
}

/** Progress, loading: the ledger ruled out with no marks yet. */
export function LedgerSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Loading progress</span>
      <div className="summary-skeleton" aria-hidden="true">
        <span style={{ width: "85%" }} />
        <span style={{ width: "55%" }} />
      </div>
      <ul className="ledger ledger-skeleton" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <li key={i} className="ledger-row" style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="ledger-day-skeleton" />
          </li>
        ))}
      </ul>
    </div>
  );
}
