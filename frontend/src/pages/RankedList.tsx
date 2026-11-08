import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { ApiError } from "../api/client";
import PlaceRow from "../components/ranking/PlaceRow";
import { TOP_CATEGORIES, useCities, usePublicList, useSubcategories } from "../hooks/lists";

export default function RankedList() {
  const { city = "", category = "" } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const location = sp.get("location") ?? "";
  const list = usePublicList(city, category, location || undefined);
  const cities = useCities();
  const subs = useSubcategories();
  const cityData = cities.data?.find((c) => c.slug === city);
  const subList = Array.isArray(subs.data) ? subs.data : [];

  const suffix = location ? `?location=${encodeURIComponent(location)}` : "";

  if (list.isPending) return <p role="status">Loading…</p>;
  if (list.error instanceof ApiError && list.error.status === 404) return <p role="alert">List not found</p>;
  if (list.isError) return <p role="alert">Could not load this list.</p>;

  const pages = list.data.pages;
  const first = pages[0]!;
  const items = pages.flatMap((p) => p.items);
  const search = new URLSearchParams({ city, category });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{first.title}</h1>
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="list-category" className="block text-sm font-medium">
            Category
          </label>
          <select
            id="list-category"
            value={category}
            onChange={(e) => navigateTo(e.target.value)}
            className="rounded border border-stone-400 p-2"
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
          <label htmlFor="list-location" className="block text-sm font-medium">
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
            className="rounded border border-stone-400 p-2"
          >
            <option value="">All of {first.city.name}</option>
            {(cityData?.locations ?? [])
              .map((l) => (
                <option key={l.id} value={l.slug}>
                  {l.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {items.every((p) => p.ranker_count === 0) ? (
        <section className="space-y-3">
          <p className="text-lg font-semibold">No rankings yet</p>
          <p className="flex flex-wrap gap-2">
            <Link className="rounded bg-brand px-3 py-2 text-white" to={`/search?${search.toString()}`}>
              Rank a place
            </Link>
            <Link className="rounded border border-stone-400 px-3 py-2" to="/places/new">
              Add a place
            </Link>
          </p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <ol>
          {items.map((p) => (
            <PlaceRow key={p.id} place={p} rank={p.rank} />
          ))}
        </ol>
      ) : null}

      {list.hasNextPage ? (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className="rounded border border-stone-400 px-4 py-2"
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
      <p className="text-sm text-stone-700" aria-live="polite">
        Showing {items.length} of {first.total}
      </p>
    </div>
  );

  function navigateTo(slug: string) {
    void navigate(`/lists/${city}/${slug}${suffix}`);
  }
}
