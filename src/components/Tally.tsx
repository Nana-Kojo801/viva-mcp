/** Tally marks: groups of four strokes with a fifth struck across. */
export function Tally({ count }: { count: number }) {
  const groups: number[] = [];
  for (let left = count; left > 0; left -= 5) groups.push(Math.min(5, left));
  return (
    <span className="tally" aria-hidden="true">
      {groups.map((n, g) => (
        <svg key={g} viewBox="0 0 34 28" className="tally-group">
          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
            <path key={i} d={`M${5 + i * 7} ${3 + (i % 2)} L${4 + i * 7 + (i % 2)} 25`} />
          ))}
          {n === 5 && <path d="M1 20 L32 7" />}
        </svg>
      ))}
    </span>
  );
}
