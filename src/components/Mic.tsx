"use client";

import { MicIcon } from "./Icons";

type Props = {
  listening: boolean;
  busy: boolean;
  /** Before a session starts: a soft halo invites the first tap. */
  inviting?: boolean;
  level: number;
  label: string;
  onPress: () => void;
};

/** The primary action: a large circle that swells with your voice while listening. */
export function Mic({ listening, busy, inviting, level, label, onPress }: Props) {
  const l = Math.min(level, 1);
  return (
    <div className="mic-wrap">
      <div className={`mic-stage${listening ? " is-listening" : ""}${inviting ? " is-inviting" : ""}${busy ? " is-busy" : ""}`} style={{ ["--level" as string]: l }}>
        <span className="mic-ring" aria-hidden="true" />
        <span className="mic-ring mic-ring-2" aria-hidden="true" />
        <button
          type="button"
          className={`mic${listening ? " is-listening" : ""}${listening && level === 0 ? " is-idle-breath" : ""}`}
          style={listening ? { transform: `scale(${1 + l * 0.14})` } : undefined}
          onClick={onPress}
          disabled={busy}
          aria-label={label}
          aria-pressed={listening}
        >
          <MicIcon className="mic-glyph" />
        </button>
      </div>
      <span className="mic-label" aria-hidden="true" key={label}>
        {label}
      </span>
    </div>
  );
}
