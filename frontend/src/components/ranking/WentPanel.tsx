import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router";

import { api, unwrap, type Schemas } from "../../api/client";
import { invalidateAfterRankingChange } from "../../hooks/ranking";
import { rankingMessage } from "../../lib/celebrate";
import { needsComment, ratingWord } from "../../lib/rating";
import { track } from "../../lib/track";
import { useCelebrate } from "../app/Celebration";
import { useInlineSignIn } from "../app/InlineSignIn";
import NumberRating, { RatingBadge } from "./NumberRating";

type Result = Schemas["QuickRatingResponse"];

/**
 * Went (R3.7): mark a place as visited and rate it 1-10 in one tap, right on the place card.
 * 5 or higher saves straight away; 4 or lower asks for a comment first. "Fine-tune" offers the
 * comparison questions for people who want an exact order.
 */
export default function WentPanel({
  placeId,
  current,
  canRate,
}: {
  placeId: number;
  /** The viewer's rating today, if any. */
  current: number | null;
  canRate: boolean;
}) {
  const id = useId();
  const qc = useQueryClient();
  const celebrate = useCelebrate();
  const { requireUser } = useInlineSignIn();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(current);
  const [note, setNote] = useState("");
  const [askNote, setAskNote] = useState(false);
  const [last, setLast] = useState<Result | null>(null);

  const save = useMutation({
    mutationFn: async (body: { rating: number; note?: string | null }) =>
      unwrap(await api.PUT("/api/places/{place_id}/rating", { params: { path: { place_id: placeId } }, body })),
    onSuccess: (res) => {
      setLast(res);
      setAskNote(false);
      invalidateAfterRankingChange(qc);
      void qc.invalidateQueries({ queryKey: ["topPicks"] });
      track("went", res.is_new ? "new" : "change");
      if (res.is_new && res.city_rank_count > 0) {
        const msg = rankingMessage(res.city_rank_count, res.city_name);
        celebrate(msg.title, { big: msg.big });
      }
    },
  });

  const choose = (n: number) => {
    setRating(n);
    if (needsComment(n)) {
      setAskNote(true); // a low rating needs a reason before it's saved
      return;
    }
    save.mutate({ rating: n });
  };

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
            You gave it <RatingBadge rating={current} />
          </>
        ) : (
          <>
            <span aria-hidden="true">✔️</span> Went
          </>
        )}
      </button>
    );
  }

  const saved = last?.ranking.rating ?? null;
  return (
    <section aria-labelledby={`${id}-h`} className="w-full space-y-3 rounded-(--radius-card) border-2 border-line bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-h`} className="font-extrabold">
          {current || saved ? "Change your rating" : "You went! How was it?"}
        </h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <NumberRating value={rating} onChange={choose} label="Rate it from 1 to 10" disabled={save.isPending} autoFocus />

      {askNote ? (
        <form
          noValidate
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (rating !== null && note.trim()) save.mutate({ rating, note: note.trim() });
          }}
        >
          <label htmlFor={`${id}-note`} className="label">
            Tell others why <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${id}-note`}
            rows={3}
            maxLength={1000}
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What went wrong? Others will thank you."
            className="field"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!note.trim() || save.isPending}>
            Save
          </button>
          <p className="hint">Ratings of 4 or lower need a short comment.</p>
        </form>
      ) : null}

      <p aria-live="polite" className="text-sm">
        {save.isPending ? <span className="text-muted">Saving…</span> : null}
        {saved !== null && !save.isPending ? (
          <span className="font-bold text-success-dark">
            Saved: you gave it {saved} · {ratingWord(saved)}
          </span>
        ) : null}
        {save.isError ? <span className="text-danger">{save.error.message}</span> : null}
      </p>
      {last && last.compare_count > 0 ? (
        <Link to={`/places/${placeId}/rank?refine=1`} className="link text-sm">
          Fine-tune: compare it with your other {last.compare_count} {last.compare_count === 1 ? "place" : "places"}
        </Link>
      ) : null}
    </section>
  );
}
