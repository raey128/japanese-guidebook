import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "../../api/client";
import { useBookmarks } from "../../hooks/lists";
import { useMyRankings } from "../../hooks/ranking";
import PlaceRow from "../ranking/PlaceRow";
import RankButton from "../RankButton";
import { ButtonLink } from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import { COPY } from "../../copy";
import Loading from "../ui/Loading";

type Place = Schemas["PlaceSummary"];

/** Bookmarks grouped by city, keeping newest-first order inside each city. Cities appear in order of their newest bookmark. */
export function groupByCity(items: Place[]): { city: Place["city"]; items: Place[] }[] {
  const groups = new Map<number, { city: Place["city"]; items: Place[] }>();
  for (const p of items) {
    const g = groups.get(p.city.id);
    if (g) g.items.push(p);
    else groups.set(p.city.id, { city: p.city, items: [p] });
  }
  return [...groups.values()];
}

/** The signed-in user's want-to-go bookmarks (R14.4). */
export default function WantToGoList() {
  const bookmarks = useBookmarks(true);
  const rankings = useMyRankings(true);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (placeId: number) =>
      unwrap(await api.DELETE("/api/bookmarks/{place_id}", { params: { path: { place_id: placeId } } })),
    onSuccess: () => {
      for (const key of ["bookmarks", "place", "map", "search"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });

  if (bookmarks.isPending) return <Loading />;
  if (bookmarks.isError) return <ErrorState onRetry={() => void bookmarks.refetch()} />;

  const rankedIds = new Set(
    rankings.data?.cities.flatMap((c) => c.categories.flatMap((k) => k.buckets.flatMap((b) => b.items.map((i) => i.place_id)))),
  );
  const items = bookmarks.data.items;
  if (items.length === 0) {
    return (
      <EmptyState emoji="♡" title={COPY.emptySaved} action={<ButtonLink to="/">Explore the map</ButtonLink>} />
    );
  }
  return (
    <div className="space-y-6">
      {remove.isError ? <p role="alert">Could not remove: {remove.error.message}</p> : null}
      {groupByCity(items).map((g) => (
        <section key={g.city.id} aria-labelledby={`wtg-city-${g.city.id}`} className="space-y-2">
          <h2 id={`wtg-city-${g.city.id}`} className="text-xl font-bold">
            {g.city.name}
          </h2>
          <ul aria-label={`Saved in ${g.city.name}`}>
            {g.items.map((p) => (
              <PlaceRow
                key={p.id}
                place={p}
                showOnMap
                actions={
                  <>
                    <RankButton placeId={p.id} ranked={rankedIds.has(p.id)} />
                    <button
                      type="button"
                      onClick={() => remove.mutate(p.id)}
                      disabled={remove.isPending}
                      className="btn btn-secondary btn-sm"
                    >
                      Remove<span className="sr-only"> {p.name} from saved</span>
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
