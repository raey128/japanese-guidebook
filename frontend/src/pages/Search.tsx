import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import PlaceRow from "../components/ranking/PlaceRow";
import RankButton from "../components/RankButton";
import WantToGoButton from "../components/WantToGoButton";
import { TOP_CATEGORIES, useCities, useSearchPlaces, useSubcategories } from "../hooks/lists";

export default function Search() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const city = sp.get("city") ?? "";
  const location = sp.get("location") ?? "";
  const category = sp.get("category") ?? "";
  const [text, setText] = useState(q);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSp(next, { replace: true });
  };

  // Debounced (150 ms) sync of the input into the URL.
  useEffect(() => {
    if (text.trim() === q.trim()) return;
    const t = setTimeout(() => update({ q: text.trim() }), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const cities = useCities();
  const subs = useSubcategories();
  const results = useSearchPlaces({ q, city, location, category });
  const cityList = Array.isArray(cities.data) ? cities.data : [];
  const subList = Array.isArray(subs.data) ? subs.data : [];
  const locations = cityList.find((c) => c.slug === city)?.locations.filter((l) => !l.is_catch_all) ?? [];
  const items = results.data?.items ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Search</h1>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="space-y-3">
        <div>
          <label htmlFor="search-q" className="block text-sm font-medium">
            Search places
          </label>
          <input
            id="search-q"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded border border-stone-400 p-2"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label htmlFor="search-city" className="block text-sm font-medium">
              City
            </label>
            <select
              id="search-city"
              value={city}
              onChange={(e) => update({ city: e.target.value, location: "" })}
              className="rounded border border-stone-400 p-2"
            >
              <option value="">Any city</option>
              {cityList.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="search-location" className="block text-sm font-medium">
              Location
            </label>
            <select
              id="search-location"
              value={location}
              disabled={!city}
              onChange={(e) => update({ location: e.target.value })}
              className="rounded border border-stone-400 p-2"
            >
              <option value="">Any location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="search-category" className="block text-sm font-medium">
              Category
            </label>
            <select
              id="search-category"
              value={category}
              onChange={(e) => update({ category: e.target.value })}
              className="rounded border border-stone-400 p-2"
            >
              <option value="">Any category</option>
              {TOP_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
              {subList.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {q.trim() && results.isFetching && items.length === 0 ? <p role="status">Searching…</p> : null}
        {q.trim() && results.isError ? <p role="alert">Search failed. Try again.</p> : null}
        {q.trim() && results.isSuccess && !results.isFetching && items.length === 0 ? (
          <div className="space-y-2">
            <p className="text-lg font-semibold">Not found</p>
            <Link className="underline" to="/places/new">
              Add it on the map
            </Link>
          </div>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul aria-label="Search results">
          {items.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              actions={
                <>
                  <RankButton placeId={p.id} ranked={p.my_ranking_id != null} />
                  <WantToGoButton placeId={p.id} isBookmarked={p.is_bookmarked} />
                </>
              }
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
