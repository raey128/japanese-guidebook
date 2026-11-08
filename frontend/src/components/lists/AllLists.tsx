import { useSearchParams } from "react-router";

import { TOP_CATEGORIES, useCities, useSubcategories } from "../../hooks/lists";
import { topCategoryInfo } from "../../lib/categories";
import Chip from "../ui/Chip";
import { getLastCity, setLastCity } from "../../lib/lastCity";
import PublicListView from "./PublicListView";


/**
 * Public ranked lists (R14.2): city → top category → optional subcategory.
 * State lives in the URL (`city`, `category`) so lists are linkable.
 */
export default function AllLists() {
  const [sp, setSp] = useSearchParams();
  const cities = useCities();
  const subs = useSubcategories();
  const cityList = Array.isArray(cities.data) ? cities.data : [];
  const subList = Array.isArray(subs.data) ? subs.data : [];

  const city = sp.get("city") || getLastCity();
  const category = sp.get("category") || TOP_CATEGORIES[0]!.slug;
  const top = TOP_CATEGORIES.some((t) => t.slug === category)
    ? category
    : (subList.find((s) => s.slug === category)?.top_category ?? TOP_CATEGORIES[0]!.slug);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    setSp(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="lists-city" className="label">
          City
        </label>
        <select
          id="lists-city"
          value={city}
          onChange={(e) => {
            setLastCity(e.target.value);
            update({ city: e.target.value });
          }}
          className="field"
        >
          {cityList.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
        {TOP_CATEGORIES.map((t) => {
          const info = topCategoryInfo(t.slug);
          return (
            <Chip
              key={t.slug}
              pressed={top === t.slug}
              emoji={info?.emoji}
              color={info?.color}
              colorDark={info?.colorDark}
              onClick={() => update({ category: t.slug })}
            >
              {t.name}
            </Chip>
          );
        })}
      </div>
      <div role="group" aria-label="Subcategory" className="flex flex-wrap gap-2">
        <Chip pressed={category === top} onClick={() => update({ category: top })}>
          All {TOP_CATEGORIES.find((t) => t.slug === top)?.name}
        </Chip>
        {subList
          .filter((s) => s.top_category === top)
          .map((s) => (
            <Chip key={s.id} pressed={category === s.slug} onClick={() => update({ category: s.slug })}>
              {s.name}
            </Chip>
          ))}
      </div>

      <PublicListView city={city} category={category} headingLevel={2} showOnMap />
    </div>
  );
}
