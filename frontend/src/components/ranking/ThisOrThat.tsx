import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api, unwrap, type Schemas } from "../../api/client";
import { invalidateAfterRankingChange, useSnapshot } from "../../hooks/ranking";
import { answer, next, type SearchState } from "../../lib/binarySearch";
import PlaceArt from "../ui/PlaceArt";

/** At most this many "this or that?" questions (decided 2026-11-27). */
export const MAX_QUESTIONS = 2;

type Snap = Schemas["Snapshot"];
type Item = Schemas["RankingItem"];

/** "#3 in your Tokyo Ramen": the place's spot across Liked, Fine and Disliked. */
export function rankLine(snap: Snap, placeId: number): string | null {
  let n = 0;
  for (const b of snap.buckets) {
    for (const it of b.items) {
      n += 1;
      if (it.place_id === placeId) return `#${n} in your ${snap.city.name} ${snap.subcategory.name.toLowerCase()}`;
    }
  }
  return null;
}

/**
 * After a reaction, place the new rating exactly (decided 2026-11-27): only if you've given the
 * same reaction to other places in this category does it ask, at most twice, "Which did you like
 * more?" against them. Then it saves the spot and says where it landed.
 */
export default function ThisOrThat({
  placeId,
  placeName,
  rating,
  onDone,
}: {
  placeId: number;
  placeName: string;
  rating: number;
  /** Where it landed ("#3 in your Tokyo ramen") and its personal score. */
  onDone: (line: string | null, score: number | null) => void;
}) {
  const qc = useQueryClient();
  const snap = useSnapshot(placeId, true);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [asked, setAsked] = useState(0);

  const bucket = snap.data?.my_ranking?.bucket ?? null;
  const list = useMemo<Item[]>(
    () => (snap.data?.buckets.find((b) => b.bucket === bucket)?.items ?? []).filter((i) => i.place_id !== placeId),
    [snap.data, bucket, placeId],
  );
  // The stretch of the list with the same reaction: the only places it could sit among.
  const same = useMemo(() => {
    const idx = list.map((it, i) => (it.rating === rating ? i : -1)).filter((i) => i >= 0);
    return idx.length ? { lo: idx[0]!, hi: idx[idx.length - 1]! + 1 } : null;
  }, [list, rating]);

  const save = useMutation({
    mutationFn: async (pos: number) => {
      const version = snap.data?.buckets.find((b) => b.bucket === bucket)?.version ?? 0;
      return unwrap(
        await api.PUT("/api/rankings", { body: { place_id: placeId, rating, position: pos, list_version: version } }),
      );
    },
    onSuccess: async () => {
      invalidateAfterRankingChange(qc);
      const fresh = await snap.refetch();
      onDone(fresh.data ? rankLine(fresh.data, placeId) : null, fresh.data?.my_ranking?.personal_score ?? null);
    },
    // Keep the starting spot.
    onError: () => onDone(snap.data ? rankLine(snap.data, placeId) : null, snap.data?.my_ranking?.personal_score ?? null),
  });

  // Nothing to compare: it already sits right. Otherwise start the (short) search.
  useEffect(() => {
    if (!snap.data || search) return;
    if (!same) onDone(rankLine(snap.data, placeId), snap.data.my_ranking?.personal_score ?? null);
    else setSearch({ lo: same.lo, hi: same.hi });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.data, same]);

  const finish = (st: SearchState) => {
    const mid = next(st);
    // Done, or out of questions: settle in the middle of what's left.
    const index = mid === "done" ? st.lo : mid;
    save.mutate(index + 1);
  };

  if (snap.isPending || !search || !snap.data) return <p className="hint">One moment…</p>;
  const mid = next(search);
  const other = mid === "done" ? undefined : list[mid];
  if (save.isPending || !other) return <p className="hint">Saving…</p>;

  const pick = (newIsBetter: boolean) => {
    const st = answer(search, newIsBetter);
    const n = asked + 1;
    setAsked(n);
    setSearch(st);
    if (next(st) === "done" || n >= MAX_QUESTIONS) finish(st);
  };

  const sub = snap.data.subcategory;
  return (
    <section aria-labelledby="tot-h" className="space-y-3">
      <h3 id="tot-h" className="font-display text-xl font-black" aria-live="polite">
        Which did you like more?
      </h3>
      <p className="hint">
        Question {asked + 1} of at most {Math.min(MAX_QUESTIONS, Math.ceil(Math.log2((same ? same.hi - same.lo : 0) + 1)))}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { id: placeId, name: placeName, better: true },
          { id: other.place_id, name: other.name, better: false },
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c.better)}
            className="overflow-hidden rounded-(--radius-card) border-2 border-b-4 border-line text-left transition-transform active:translate-y-0.5 active:border-b-2"
          >
            <PlaceArt id={c.id} subcategorySlug={sub.slug} topCategory={sub.top_category} variant="banner" name={c.name} className="min-h-32 rounded-none" />
          </button>
        ))}
      </div>
    </section>
  );
}
