"use client";

type Props = {
  listening: boolean;
  busy: boolean;
  level: number;
  label: string;
  onPress: () => void;
};

/** The primary action: a large circle that breathes with input level while listening. */
export function Mic({ listening, busy, level, label, onPress }: Props) {
  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic${listening ? " is-listening" : ""}${listening && level === 0 ? " is-idle-breath" : ""}`}
        style={listening ? { transform: `scale(${1 + Math.min(level, 1) * 0.18})` } : undefined}
        onClick={onPress}
        disabled={busy}
        aria-label={label}
        aria-pressed={listening}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mic-glyph">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" />
        </svg>
      </button>
      <span className="mic-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
