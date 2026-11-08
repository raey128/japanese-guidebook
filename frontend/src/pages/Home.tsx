import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { api, unwrap } from "../api/client";
import { TOP_CATEGORIES, useCities } from "../hooks/lists";

export default function Home() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const cities = useCities();
  const cityList = Array.isArray(cities.data) ? cities.data : [];
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await api.GET("/api/health")),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Where to eat, see and stay in Japan</h1>
      <p>Rankings by travellers who have been there, not inflated star ratings.</p>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
        }}
      >
        <label htmlFor="home-search" className="sr-only">
          Search places
        </label>
        <input
          id="home-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search places"
          className="min-w-0 flex-1 rounded border border-stone-400 p-2"
        />
        <button type="submit" className="rounded border px-3 py-2">
          Search
        </button>
      </form>
      <p className="flex flex-wrap gap-2">
        <Link className="rounded bg-brand px-3 py-2 text-white" to="/map">Open the map</Link>
        <Link className="rounded border px-3 py-2" to="/search">Browse search</Link>
      </p>
      {cityList.length > 0 ? (
        <section aria-labelledby="home-lists" className="space-y-2">
          <h2 id="home-lists" className="text-lg font-semibold">
            Ranked lists
          </h2>
          {cityList.map((c) => (
            <p key={c.id} className="flex flex-wrap items-center gap-x-3">
              <span className="font-medium">{c.name}</span>
              {TOP_CATEGORIES.map((t) => (
                <Link key={t.slug} className="underline" to={`/lists/${c.slug}/${t.slug}`}>
                  {t.name}
                  <span className="sr-only"> in {c.name}</span>
                </Link>
              ))}
            </p>
          ))}
        </section>
      ) : null}
      <p className="text-sm text-stone-700" data-testid="api-health">
        API status:{" "}
        {health.isPending ? "checking…" : health.isError ? "unreachable" : health.data.status}
      </p>
    </div>
  );
}
