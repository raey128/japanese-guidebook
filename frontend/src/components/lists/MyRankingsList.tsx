import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";

import { api, unwrap } from "../../api/client";
import { invalidateAfterRankingChange, useMyRankings } from "../../hooks/ranking";
import Badges from "../Badges";
import PlaceNames from "../PlaceNames";
import { ShowOnMapLink } from "../ranking/PlaceRow";
import { ButtonLink } from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import { COPY } from "../../copy";
import Loading from "../ui/Loading";

const LABEL = { liked: "Liked", fine: "Fine", disliked: "Disliked" } as const;

/** The signed-in user's rankings, grouped by city → subcategory → bucket (R14.3). */
export default function MyRankingsList() {
  const rankings = useMyRankings(true);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (rankingId: number) =>
      unwrap(await api.DELETE("/api/rankings/{ranking_id}", { params: { path: { ranking_id: rankingId } } })),
    onSuccess: () => invalidateAfterRankingChange(qc),
  });

  if (rankings.isPending) return <Loading />;
  if (rankings.isError) return <ErrorState onRetry={() => void rankings.refetch()} />;

  const cities = rankings.data.cities;
  return (
    <div className="space-y-6">
      {del.isError ? <p role="alert">Could not delete: {del.error.message}</p> : null}
      {cities.length === 0 ? (
        <EmptyState emoji="🍜" title={COPY.emptyMine} action={<ButtonLink to="/">Explore the map</ButtonLink>} />
      ) : null}
      {cities.map((c) => (
        <section key={c.city.id} aria-labelledby={`mine-city-${c.city.id}`} className="space-y-4">
          <h2 id={`mine-city-${c.city.id}`} className="text-xl font-bold">
            {c.city.name}
          </h2>
          {c.categories.map((cat) => (
            <div key={cat.subcategory.id} className="space-y-2">
              <h3 className="text-lg font-semibold">{cat.subcategory.name}</h3>
              {cat.buckets
                .filter((b) => b.items.length > 0)
                .map((b) => (
                  <div key={b.bucket}>
                    <h4 className="text-sm font-extrabold uppercase tracking-wide text-muted">{LABEL[b.bucket]}</h4>
                    <ol className="divide-y divide-line">
                      {b.items.map((it) => (
                        <li key={it.ranking_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span className="w-6 text-right text-lg font-extrabold text-brand">{it.position}</span>
                          <Link className="min-w-0 flex-1 hover:underline" to={`/places/${it.place_id}`}>
                            <PlaceNames name={it.name} nameJa={it.name_ja} as="span" />
                          </Link>
                          <span className="badge bg-success-soft text-success-dark">{it.personal_score.toFixed(1)}</span>
                          <Badges badges={it.badges} />
                          <ShowOnMapLink placeId={it.place_id} name={it.name} />
                          <Link className="btn btn-secondary btn-sm" to={`/places/${it.place_id}/rank`}>
                            Re-rank<span className="sr-only"> {it.name}</span>
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-danger"
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
