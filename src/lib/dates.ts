// Pure date helpers shared by the server and the browser.

const DAY = 86_400_000;

/** Whole days from today (UTC) until an ISO date (YYYY-MM-DD). Null when there is no valid date. */
export function daysUntil(isoDate: string | null | undefined, now = Date.now()): number | null {
  if (!isoDate) return null;
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / DAY);
}

/** "Exam today", "Exam tomorrow", "Exam in 5 days"; null for past or missing dates. */
export function examLabel(isoDate: string | null | undefined, now = Date.now()): string | null {
  const d = daysUntil(isoDate, now);
  if (d == null || d < 0) return null;
  if (d === 0) return "Exam today";
  if (d === 1) return "Exam tomorrow";
  return `Exam in ${d} days`;
}
