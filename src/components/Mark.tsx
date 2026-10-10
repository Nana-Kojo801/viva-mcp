import type { Verdict } from "@/lib/client/mcp";

const STAMP: Record<Verdict, { text: string; label: string }> = {
  correct: { text: "correct", label: "Correct" },
  partial: { text: "partly", label: "Partly right" },
  incorrect: { text: "missed", label: "Not quite" },
};

/** The examiner's rubber stamp, thumped onto the card once. */
export function Mark({ verdict }: { verdict: Verdict }) {
  const s = STAMP[verdict];
  return (
    <span className={`stamp stamp-${verdict}`} role="img" aria-label={s.label}>
      {s.text}
    </span>
  );
}
