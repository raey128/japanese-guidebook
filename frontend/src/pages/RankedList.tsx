import { useNavigate, useParams, useSearchParams } from "react-router";

import PublicListView from "../components/lists/PublicListView";
import { TOP_CATEGORIES, useCities, useSubcategories } from "../hooks/lists";

export default function RankedList() {
  const { city = "", category = "" } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const location = sp.get("location") ?? "";
  const cities = useCities();
  const subs = useSubcategories();
  const cityData = cities.data?.find((c) => c.slug === city);
  const subList = Array.isArray(subs.data) ? subs.data : [];

  const suffix = location ? `?location=${encodeURIComponent(location)}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="list-category" className="label">
            Category
          </label>
          <select
            id="list-category"
            value={category}
            onChange={(e) => void navigate(`/lists/${city}/${e.target.value}${suffix}`)}
            className="field"
          >
            <optgroup label="All of a type">
              {TOP_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Specific">
              {subList.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label htmlFor="list-location" className="label">
            Location
          </label>
          <select
            id="list-location"
            value={location}
            onChange={(e) => {
              const next = new URLSearchParams(sp);
              if (e.target.value) next.set("location", e.target.value);
              else next.delete("location");
              setSp(next);
            }}
            className="field"
          >
            <option value="">All of {cityData?.name ?? "the city"}</option>
            {(cityData?.locations ?? []).map((l) => (
              <option key={l.id} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <PublicListView city={city} category={category} location={location} headingLevel={1} />
    </div>
  );
}
