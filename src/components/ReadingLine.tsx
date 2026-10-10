"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

type Props = {
  text: string;
  /** Char index of the word being spoken; -1 when not speaking. */
  charIndex: number;
};

/** The question, with a highlighter bar that follows the spoken word. */
export function ReadingLine({ text, charIndex }: Props) {
  const words = useMemo(() => [...text.matchAll(/\S+/g)].map((m) => ({ word: m[0], start: m.index ?? 0 })), [text]);
  const active = charIndex < 0 ? -1 : words.findLastIndex((w) => w.start <= charIndex);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [bar, setBar] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = active >= 0 ? refs.current[active] : null;
    setBar(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
  }, [active, text]);

  return (
    <p className="question">
      {bar && (
        <span
          aria-hidden="true"
          className="reading-bar"
          style={{ transform: `translate(${bar.x - 4}px, ${bar.y + 2}px)`, width: bar.w + 8, height: bar.h - 2 }}
        />
      )}
      {words.map((w, i) => (
        <span key={i}>
          <span ref={(el) => void (refs.current[i] = el)} className={i === active ? "word is-reading" : "word"}>
            {w.word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
