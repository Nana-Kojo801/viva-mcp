import type { Verdict } from "@/lib/client/mcp";

const LABEL: Record<Verdict, string> = { correct: "Correct", partial: "Partly right", incorrect: "Not quite" };

/** A hand-drawn examiner's mark, stroked in once. */
export function Mark({ verdict }: { verdict: Verdict }) {
  return (
    <svg className={`mark mark-${verdict}`} viewBox="0 0 64 64" role="img" aria-label={LABEL[verdict]}>
      <circle cx="32" cy="32" r="30" className="mark-disc" />
      {verdict === "correct" && <path pathLength={1} d="M16 34 C20 37, 24 41, 27 46 C33 34, 40 24, 50 15" />}
      {verdict === "partial" && (
        <path
          pathLength={1}
          d="M33 13 C21 12, 13 21, 14 32 C15 43, 24 51, 34 50 C44 49, 51 41, 50 31 C49 23, 44 17, 37 15 C35 14.5, 33 15, 31 17"
        />
      )}
      {verdict === "incorrect" && (
        <>
          <path pathLength={1} d="M18 17 C26 26, 35 36, 47 48" />
          <path pathLength={1} className="mark-second" d="M47 16 C38 25, 28 36, 17 47" />
        </>
      )}
    </svg>
  );
}
