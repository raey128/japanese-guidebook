const LABELS: Record<string, string> = {
  unverified: "Unverified",
  closed: "Closed",
  reported_closed: "Reported closed",
  hidden: "Hidden",
};

export default function Badges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b} className="rounded-full border border-stone-400 bg-stone-100 px-2 py-0.5 text-xs text-stone-800">
          {LABELS[b] ?? b}
        </span>
      ))}
    </span>
  );
}
