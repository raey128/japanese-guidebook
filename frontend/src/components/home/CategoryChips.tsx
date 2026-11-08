import type { Schemas } from "../../api/client";
import { TOP_CATEGORY_INFO, topCategoryInfo } from "../../lib/categories";
import Chip from "../ui/Chip";

/**
 * Single-select category chips (R11.5): 4 top categories in their pin colours, then the active
 * one's subcategories. Tapping the active chip clears it. A "♡ Saved" chip (R17.2) comes first
 * for signed-in users and filters the map to their saved places.
 */
export default function CategoryChips({
  category,
  onCategory,
  subcategories,
  showSaved,
  savedOnly,
  onSavedOnly,
}: {
  category: string;
  onCategory: (slug: string) => void;
  subcategories: Schemas["SubcategoryOut"][];
  showSaved: boolean;
  savedOnly: boolean;
  onSavedOnly: (v: boolean) => void;
}) {
  const activeSub = subcategories.find((s) => s.slug === category);
  const activeTop = topCategoryInfo(category)?.slug ?? activeSub?.top_category ?? "";
  const subs = subcategories.filter((s) => s.top_category === activeTop);
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Category" className="flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
        {showSaved ? (
          <Chip pressed={savedOnly} emoji="♡" onClick={() => onSavedOnly(!savedOnly)} className="shadow-sm">
            Saved
          </Chip>
        ) : null}
        {TOP_CATEGORY_INFO.map((c) => (
          <Chip
            key={c.slug}
            pressed={activeTop === c.slug}
            emoji={c.emoji}
            color={c.color}
            colorDark={c.colorDark}
            className="shadow-sm"
            onClick={() => onCategory(activeTop === c.slug && category === c.slug ? "" : c.slug)}
          >
            {c.name}
          </Chip>
        ))}
      </div>
      {activeTop ? (
        <div role="group" aria-label="Subcategory" className="flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
          {subs.map((s) => {
            const info = topCategoryInfo(s.top_category);
            return (
              <Chip
                key={s.id}
                pressed={category === s.slug}
                color={info?.color}
                colorDark={info?.colorDark}
                className="shadow-sm"
                onClick={() => onCategory(category === s.slug ? activeTop : s.slug)}
              >
                {s.name}
              </Chip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Small colour key (R11.6): colour + emoji → category name. */
export function Legend() {
  return (
    <ul aria-label="Map key" className="space-y-1.5 text-sm font-bold">
      {TOP_CATEGORY_INFO.map((c) => (
        <li key={c.slug} className="flex items-center gap-2">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full border-2 border-white text-sm shadow" style={{ background: c.color }}>
            {c.emoji}
          </span>
          {c.name}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-white text-sm text-brand shadow">♥</span>
        Saved by you
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-white text-sm text-success shadow">✓</span>
        Ranked by you
      </li>
    </ul>
  );
}
