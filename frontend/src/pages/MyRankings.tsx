import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";

import { api, unwrap } from "../api/client";
import Badges from "../components/Badges";
import PlaceNames from "../components/PlaceNames";
import { useMe } from "../hooks/auth";
import { invalidateAfterRankingChange, useMyRankings } from "../hooks/ranking";

const LABEL = { liked: "Liked", fine: "Fine", disliked: "Disliked" } as const;

export default function MyRankings() {
  const me = useMe();
  const signedIn = !!me.data?.user;
  const rankings = useMyRankings(signedIn);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (rankingId: number) =>
      unwrap(await api.DELETE("/api/rankings/{ranking_id}", { params: { path: { ranking_id: rankingId } } })),
    onSuccess: () => invalidateAfterRankingChange(qc),
  });

  if (me.isPending) return <p role="status">Loading…</p>;
  if (!signedIn) return <Navigate to="/sign-in?next=%2Fme%2Frankings" replace />;
  if (rankings.isPending) return <p role="status">Loading…</p>;
  if (rankings.isError) return <p role="alert">Could not load your rankings.</p>;

  const cities = rankings.data.cities;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My rankings</h1>
      <p className="flex gap-4">
        <Link className="underline" to="/me/want-to-go">
          Want to go
        </Link>
        <Link className="underline" to="/settings">
          Settings
        </Link>
        <Link className="underline" to={`/u/${me.data?.user?.username ?? ""}`}>
          Public profile
        </Link>
      </p>
      {del.isError ? <p role="alert">Could not delete: {del.error.message}</p> : null}
      {cities.length === 0 ? (
        <p>
          You haven't ranked anything yet. <Link className="underline" to="/search">Find a place to rank</Link>.
        </p>
      ) : null}
      {cities.map((c) => (
        <section key={c.city.id} aria-labelledby={`city-${c.city.id}`} className="space-y-4">
          <h2 id={`city-${c.city.id}`} className="text-xl font-bold">
            {c.city.name}
          </h2>
          {c.categories.map((cat) => (
            <div key={cat.subcategory.id} className="space-y-2">
              <h3 className="text-lg font-semibold">{cat.subcategory.name}</h3>
              {cat.buckets
                .filter((b) => b.items.length > 0)
                .map((b) => (
                  <div key={b.bucket}>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-700">{LABEL[b.bucket]}</h4>
                    <ol className="divide-y divide-stone-300">
                      {b.items.map((it) => (
                        <li key={it.ranking_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span className="w-6 text-right font-bold">{it.position}</span>
                          <Link className="min-w-0 flex-1 hover:underline" to={`/places/${it.place_id}`}>
                            <PlaceNames name={it.name} nameJa={it.name_ja} as="span" />
                          </Link>
                          <span className="text-sm text-stone-800">{it.personal_score.toFixed(1)}</span>
                          <Badges badges={it.badges} />
                          <Link className="text-sm underline" to={`/places/${it.place_id}/rank`}>
                            Re-rank<span className="sr-only"> {it.name}</span>
                          </Link>
                          <button
                            type="button"
                            className="text-sm text-red-800 underline"
                            onClick={() => {
                              if (window.confirm(`Delete your ranking of ${it.name}?`)) del.mutate(it.ranking_id);
                            }}
                          >
                            Delete<span className="sr-only"> {it.name}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
