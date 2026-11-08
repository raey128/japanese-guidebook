import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";

import { api, unwrap } from "../api/client";
import PlaceRow from "../components/ranking/PlaceRow";
import RankButton from "../components/RankButton";
import { useMe } from "../hooks/auth";
import { useBookmarks } from "../hooks/lists";
import { useMyRankings } from "../hooks/ranking";

export default function WantToGo() {
  const me = useMe();
  const signedIn = !!me.data?.user;
  const bookmarks = useBookmarks(signedIn);
  const rankings = useMyRankings(signedIn);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (placeId: number) =>
      unwrap(await api.DELETE("/api/bookmarks/{place_id}", { params: { path: { place_id: placeId } } })),
    onSuccess: () => {
      for (const key of ["bookmarks", "place", "map", "search"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });

  if (me.isPending) return <p role="status">Loading…</p>;
  if (!signedIn) return <Navigate to="/sign-in?next=%2Fme%2Fwant-to-go" replace />;
  if (bookmarks.isPending) return <p role="status">Loading…</p>;
  if (bookmarks.isError) return <p role="alert">Could not load your want-to-go list.</p>;

  const rankedIds = new Set(
    rankings.data?.cities.flatMap((c) => c.categories.flatMap((k) => k.buckets.flatMap((b) => b.items.map((i) => i.place_id)))),
  );
  const items = bookmarks.data.items;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Want to go</h1>
      {remove.isError ? <p role="alert">Could not remove: {remove.error.message}</p> : null}
      {items.length === 0 ? (
        <p>
          Nothing saved yet. <Link className="underline" to="/map">Browse the map</Link> or <Link className="underline" to="/search">search</Link>.
        </p>
      ) : (
        <ul aria-label="Want to go">
          {items.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              actions={
                <>
                  <RankButton placeId={p.id} ranked={rankedIds.has(p.id)} />
                  <button
                    type="button"
                    onClick={() => remove.mutate(p.id)}
                    disabled={remove.isPending}
                    className="rounded border border-stone-400 px-3 py-2 text-sm"
                  >
                    Remove<span className="sr-only"> {p.name} from want to go</span>
                  </button>
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
