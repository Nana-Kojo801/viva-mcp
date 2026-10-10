"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/client/mcp";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up from 0 when it first appears. */
export function CountUp({ value, duration = 900, format = (n: number) => String(Math.round(n)) }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) return setShown(value);
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/** Tally marks, groups of four strokes with a fifth struck across, drawn in one after another. */
export function Tally({ count, delay = 0, className = "" }: { count: number; delay?: number; className?: string }) {
  const groups: number[] = [];
  for (let left = count; left > 0; left -= 5) groups.push(Math.min(5, left));
  let stroke = 0;
  return (
    <span className={`tally ${className}`} aria-hidden="true">
      {groups.map((n, g) => (
        <svg key={g} viewBox="0 0 34 28" className="tally-group">
          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
            <path
              key={i}
              pathLength={1}
              style={{ animationDelay: `${delay + stroke++ * 70}ms` }}
              d={`M${5 + i * 7} ${3 + (i % 2)} L${4 + i * 7 + (i % 2)} 25`}
            />
          ))}
          {n === 5 && <path pathLength={1} style={{ animationDelay: `${delay + stroke++ * 70}ms` }} d="M1 20 L32 7" />}
        </svg>
      ))}
    </span>
  );
}

/** A small examiner's mark for lists and the session strip. */
export function MiniMark({ verdict }: { verdict: Verdict }) {
  return (
    <svg viewBox="0 0 20 20" className={`mini-mark mini-${verdict}`} role="img" aria-label={verdict === "correct" ? "Correct" : verdict === "partial" ? "Partly right" : "Missed"}>
      {verdict === "correct" && <path d="M4.5 10.5 8 14l7.5-8.5" />}
      {verdict === "partial" && <path d="M10 3.5c-3.6 0-6.5 2.9-6.5 6.5s2.9 6.5 6.5 6.5 6.5-2.9 6.5-6.5c0-2.6-1.6-4.9-3.8-5.9" />}
      {verdict === "incorrect" && <path d="M5 5l10 10M15 5 5 15" />}
    </svg>
  );
}
