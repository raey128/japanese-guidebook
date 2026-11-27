import type { Schemas } from "../../api/client";

/** A sneak peek of what people say about a place (decided 2026-11-27): one short quote. */
export default function ReviewPeek({ peek, className = "" }: { peek: Schemas["TopNote"] | null | undefined; className?: string }) {
  if (!peek) return null;
  return (
    <p className={`line-clamp-2 text-sm text-ink/80 ${className}`}>
      <span className="font-semibold">“{peek.note}”</span> <span className="text-xs text-muted">— {peek.author}</span>
    </p>
  );
}
