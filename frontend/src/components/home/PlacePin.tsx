import type { Schemas } from "../../api/client";
import { topCategoryInfo } from "../../lib/categories";

type Point = Schemas["MapPoint"];

/** Accessible name: "Ichiran, Ramen, 8.7, saved, ranked by you, pending review" (N3.5, R17.2). */
export function pinLabel(p: Point, categoryName: string, showScore: boolean): string {
  const parts = [p.name, categoryName];
  if (showScore && p.public_score !== null && p.ranker_count > 0) parts.push(`score ${p.public_score.toFixed(1)}`);
  if (p.saved) parts.push("saved");
  if (p.ranked) parts.push("ranked by you");
  if (p.badges.includes("pending")) parts.push("pending review");
  return parts.join(", ");
}

/** A round category-coloured pin with its emoji (R11.6, R16.3), score when zoomed in (R15.1), ♡/✓ marks (R17.2). */
export default function PlacePin({
  point,
  categoryName,
  selected,
  showScore,
  onSelect,
}: {
  point: Point;
  categoryName: string;
  selected: boolean;
  showScore: boolean;
  onSelect: () => void;
}) {
  const info = topCategoryInfo(point.top_category);
  const pending = point.badges.includes("pending");
  const score = showScore && point.public_score !== null && point.ranker_count > 0 ? point.public_score.toFixed(1) : null;
  return (
    <button
      type="button"
      aria-label={pinLabel(point, categoryName, showScore)}
      aria-pressed={selected}
      data-category={point.top_category}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`relative flex flex-col items-center transition-transform motion-reduce:transition-none ${selected ? "z-10 scale-125" : "hover:scale-110"}`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full border-[3px] text-lg shadow-md ${
          selected ? "border-ink" : "border-white"
        } ${pending ? "opacity-70 outline-2 outline-dashed outline-ink" : ""}`}
        style={{ background: info?.iconBg ?? "var(--color-brand)" }}
      >
        <span aria-hidden="true">{info?.emoji ?? "📍"}</span>
      </span>
      {score ? (
        <span aria-hidden="true" className="-mt-1.5 rounded-full border-2 border-white bg-ink px-1.5 text-xs font-extrabold leading-4 text-white shadow">
          {score}
        </span>
      ) : null}
      {point.saved || point.ranked ? (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-white text-[11px] font-extrabold shadow"
          style={{ color: point.saved ? "var(--color-brand)" : "var(--color-success)" }}
        >
          {point.saved ? "♥" : "✓"}
        </span>
      ) : null}
    </button>
  );
}
