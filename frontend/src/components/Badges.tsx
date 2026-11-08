const LABELS: Record<string, string> = {
  unverified: "Unverified",
  closed: "Closed",
  reported_closed: "Reported closed",
  hidden: "Hidden",
  pending: "⏳ Pending review",
};

export default function Badges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b} className="badge bg-warning-soft text-warning-ink">
          {LABELS[b] ?? b}
        </span>
      ))}
    </span>
  );
}
