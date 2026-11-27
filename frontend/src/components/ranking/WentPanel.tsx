import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { api, unwrap, type Schemas } from "../../api/client";
import { invalidateAfterRankingChange } from "../../hooks/ranking";
import { rankingMessage } from "../../lib/celebrate";
import { reactionFor, type Reaction } from "../../lib/reactions";
import { track } from "../../lib/track";
import { useCelebrate } from "../app/Celebration";
import { useInlineSignIn } from "../app/InlineSignIn";
import NumberRating, { RatingBadge } from "./NumberRating";
import ReactionPicker from "./ReactionPicker";
import ThisOrThat from "./ThisOrThat";

type Result = Schemas["QuickRatingResponse"];

/**
 * Went (R3.7, decided 2026-11-27): mark a place as visited and rate it right on the place card.
 * One tap on a reaction sticker (or a number, for people who prefer that), then at most two
 * "Which did you like more?" questions, then where it landed: "#3 in your Tokyo ramen · 8.6".
 */
export default function WentPanel({
  placeId,
  placeName,
  current,
  canRate,
}: {
  placeId: number;
  placeName: string;
  /** The viewer's rating today (1-10), if any. */
  current: number | null;
  canRate: boolean;
}) {
  const id = useId();
  const qc = useQueryClient();
  const celebrate = useCelebrate();
  const { requireUser } = useInlineSignIn();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"stickers" | "numbers">("stickers");
  const [reaction, setReaction] = useState<Reaction["key"] | null>(reactionFor(current)?.key ?? null);
  const [number, setNumber] = useState<number | null>(current);
  const [placing, setPlacing] = useState<number | null>(null); // rating being placed
  const [landed, setLanded] = useState<{ line: string | null; score: number | null } | null>(null);

  const save = useMutation({
    mutationFn: async (rating: number) =>
      unwrap(await api.PUT("/api/places/{place_id}/rating", { params: { path: { place_id: placeId } }, body: { rating } })),
    onSuccess: (res: Result) => {
      invalidateAfterRankingChange(qc);
      void qc.invalidateQueries({ queryKey: ["topPicks"] });
      track("went", res.is_new ? "new" : "change");
      if (res.is_new && res.city_rank_count > 0) {
        const msg = rankingMessage(res.city_rank_count, res.city_name);
        celebrate(msg.title, { big: msg.big });
      }
      setLanded(null);
      setPlacing(res.ranking.rating ?? null);
    },
  });

  const rate = (rating: number) => save.mutate(rating);

  if (!canRate) return null;

  if (!open) {
    return (
      <button
        type="button"
        className={`btn min-h-11 flex-1 text-base ${current ? "btn-secondary" : "btn-primary"}`}
        onClick={() => requireUser(() => setOpen(true), "Pick a username to rate places")}
      >
        {current ? (
          <>
            <span aria-hidden="true">{reactionFor(current)?.emoji}</span> You went · <RatingBadge rating={current} />
          </>
        ) : (
          <>
            <span aria-hidden="true">✔️</span> Went
          </>
        )}
      </button>
    );
  }

  return (
    <section aria-labelledby={`${id}-h`} className="w-full space-y-3 rounded-(--radius-card) border-2 border-line bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-h`} className="font-display text-lg font-black">
          {current ? "Change your rating" : "You went! How was it?"}
        </h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {placing !== null && !landed ? (
        <ThisOrThat
          placeId={placeId}
          placeName={placeName}
          rating={placing}
          onDone={(line, score) => setLanded({ line, score })}
        />
      ) : landed ? (
        <div role="status" className="space-y-1 text-center">
          <p className="font-display text-xl font-black text-brand-dark">{landed.line ?? "Saved!"}</p>
          {landed.score !== null ? (
            <p className="text-sm font-bold text-muted">Your score: {landed.score.toFixed(1)}</p>
          ) : null}
          <button type="button" className="link text-sm" onClick={() => {
              setLanded(null);
              setPlacing(null);
            }}>
            Change it
          </button>
        </div>
      ) : mode === "stickers" ? (
        <>
          <ReactionPicker
            value={reaction}
            disabled={save.isPending}
            onChange={(r) => {
              setReaction(r.key);
              rate(r.rating);
            }}
          />
          <button type="button" className="link text-sm" onClick={() => setMode("numbers")}>
            Rate with a number instead
          </button>
        </>
      ) : (
        <>
          <NumberRating
            value={number}
            label="Rate it from 1 to 10"
            disabled={save.isPending}
            onChange={(n) => {
              setNumber(n);
              rate(n);
            }}
          />
          <button type="button" className="link text-sm" onClick={() => setMode("stickers")}>
            Use the stickers instead
          </button>
        </>
      )}

      <p aria-live="polite" className="text-sm">
        {save.isPending ? <span className="text-muted">Saving…</span> : null}
        {save.isError ? <span className="text-danger">{save.error.message}</span> : null}
      </p>
    </section>
  );
}
