export function formatScore(score: number | null, rankerCount: number): string {
  if (score === null) return "Not yet ranked";
  return `${score.toFixed(1)} · ${rankerCount} ${rankerCount === 1 ? "ranker" : "rankers"}`;
}

export default function Score({ score, rankerCount }: { score: number | null; rankerCount: number }) {
  return <span className="badge bg-success-soft text-success-dark">{formatScore(score, rankerCount)}</span>;
}
