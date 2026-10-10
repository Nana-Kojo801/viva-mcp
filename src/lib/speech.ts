// Helpers for the `spoken` field: plain sentences for text-to-speech, never more than three.

export function sentences(text: string): string[] {
  return (
    text
      .replace(/[*_`#>]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

export function speak(...parts: (string | null | undefined | false)[]): string {
  const all = parts.filter((p): p is string => !!p).flatMap(sentences);
  return all.slice(0, 3).join(" ");
}

export function inDays(ms: number, now = Date.now()): string {
  const days = Math.round((ms - now) / 86_400_000);
  if (days <= 0) {
    const hours = Math.max(1, Math.round((ms - now) / 3_600_000));
    return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
  }
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
