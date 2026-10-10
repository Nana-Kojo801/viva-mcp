// SM-2 spaced repetition, plain code (no AI).

export type SchedulingState = {
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
};

export type ScheduledState = SchedulingState & { due_at: number };

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_EASE = 1.3;
/** A missed card keeps SM-2's 1-day interval but is shown again after this relearning step, later in the same session. */
export const RELEARN_MS = 10 * 60 * 1000;

export function review(state: SchedulingState, quality: number, now: number = Date.now()): ScheduledState {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError(`quality must be an integer from 0 to 5, got ${quality}`);
  }
  let { ease, interval_days, repetitions, lapses } = state;

  if (quality < 3) {
    repetitions = 0;
    interval_days = 1;
    lapses += 1;
  } else {
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else interval_days = interval_days * ease;
    repetitions += 1;
  }

  ease = Math.max(MIN_EASE, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  return {
    ease: round(ease, 4),
    interval_days: round(interval_days, 4),
    repetitions,
    lapses,
    due_at: quality < 3 ? now + RELEARN_MS : now + Math.round(interval_days * DAY_MS),
  };
}

export type Verdict = "correct" | "partial" | "incorrect";

// Transcribed speech with these markers counts as a hesitant answer.
const HESITATION = /\b(um+|uh+|er+m?|hmm+|i think|i guess|maybe|not sure|probably)\b/i;

export function isHesitant(answer: string): boolean {
  return HESITATION.test(answer);
}

export function verdictToQuality(verdict: Verdict, answer = ""): number {
  if (verdict === "correct") return isHesitant(answer) ? 4 : 5;
  if (verdict === "partial") return 3;
  return 1;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
