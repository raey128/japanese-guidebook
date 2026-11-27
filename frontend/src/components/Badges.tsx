const LABELS: Record<string, string> = {
  unverified: "Unverified",
  closed: "Closed",
  reported_closed: "Reported closed",
  hidden: "Hidden",
  pending: "⏳ Pending review",
};

/** "Unverified" is not shown (decided 2026-11-27): nearly every new place is, so it was noise. */
const HIDDEN = new Set(["unverified"]);

export default function Badges({ badges: all }: { badges: string[] }) {
  const badges = all.filter((b) => !HIDDEN.has(b));
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
