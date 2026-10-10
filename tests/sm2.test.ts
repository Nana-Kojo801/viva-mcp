import { describe, expect, it } from "vitest";
import { DAY_MS, MIN_EASE, review, verdictToQuality, type SchedulingState } from "../src/lib/sm2";

const fresh: SchedulingState = { ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };
const NOW = 1_700_000_000_000;

describe("review", () => {
  it("schedules 1 day, then 6 days, then interval * ease", () => {
    const first = review(fresh, 5, NOW);
    expect(first.interval_days).toBe(1);
    expect(first.repetitions).toBe(1);
    expect(first.due_at).toBe(NOW + DAY_MS);

    const second = review(first, 5, NOW);
    expect(second.interval_days).toBe(6);
    expect(second.repetitions).toBe(2);

    const third = review(second, 5, NOW);
    expect(third.interval_days).toBeCloseTo(6 * second.ease, 3);
    expect(third.repetitions).toBe(3);
  });

  it("resets on a failed answer and counts a lapse", () => {
    const learned: SchedulingState = { ease: 2.6, interval_days: 15, repetitions: 3, lapses: 0 };
    const after = review(learned, 1, NOW);
    expect(after.repetitions).toBe(0);
    expect(after.interval_days).toBe(1);
    expect(after.lapses).toBe(1);
    expect(after.due_at).toBe(NOW + DAY_MS);
  });

  it("updates ease with the SM-2 formula", () => {
    expect(review(fresh, 5, NOW).ease).toBeCloseTo(2.6, 5);
    expect(review(fresh, 4, NOW).ease).toBeCloseTo(2.5, 5);
    expect(review(fresh, 3, NOW).ease).toBeCloseTo(2.36, 5);
    expect(review(fresh, 1, NOW).ease).toBeCloseTo(1.96, 5);
  });

  it("never drops ease below 1.3", () => {
    let s: SchedulingState = { ...fresh, ease: 1.35 };
    for (let i = 0; i < 5; i++) s = review(s, 0, NOW);
    expect(s.ease).toBe(MIN_EASE);
  });

  it("brings a wrong answer back sooner than a right one", () => {
    const learned: SchedulingState = { ease: 2.5, interval_days: 6, repetitions: 2, lapses: 0 };
    expect(review(learned, 1, NOW).due_at).toBeLessThan(review(learned, 5, NOW).due_at);
  });

  it("rejects out-of-range quality", () => {
    expect(() => review(fresh, 6, NOW)).toThrow(RangeError);
    expect(() => review(fresh, -1, NOW)).toThrow(RangeError);
    expect(() => review(fresh, 2.5, NOW)).toThrow(RangeError);
  });
});

describe("verdictToQuality", () => {
  it("maps verdicts to quality", () => {
    expect(verdictToQuality("correct", "Demand rises when price falls")).toBe(5);
    expect(verdictToQuality("correct", "um, I think demand rises")).toBe(4);
    expect(verdictToQuality("partial")).toBe(3);
    expect(verdictToQuality("incorrect")).toBe(1);
  });
});
