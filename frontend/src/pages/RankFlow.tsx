import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router";

import { api, ApiError, unwrap, type Schemas } from "../api/client";
import NoteFields, { type NoteValue } from "../components/ranking/NoteFields";
import StarRating from "../components/ranking/StarRating";
import PlaceNames from "../components/PlaceNames";
import { useMe } from "../hooks/auth";
import { invalidateAfterRankingChange, usePlace, useSnapshot } from "../hooks/ranking";
import { answer, next, position, start, type SearchState } from "../lib/binarySearch";
import Loading from "../components/ui/Loading";
import { useCelebrate } from "../components/app/Celebration";
import { rankingMessage } from "../lib/celebrate";
import { track } from "../lib/track";
import { bucketForRating, needsComment, RATING_LABELS, reviewProblem } from "../lib/rating";

type Bucket = Schemas["MyRanking"]["bucket"];
type Step = "rating" | "compare" | "note" | "done";

const BUCKET_LABEL: Record<Bucket, string> = { liked: "Liked", fine: "Fine", disliked: "Disliked" };

function isTyping(t: EventTarget | null) {
  if (t instanceof HTMLInputElement && t.type === "radio") return false; // the star buttons
  return t instanceof HTMLElement && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT");
}

export default function RankFlow() {
  const id = Number(useParams().id);
  const loc = useLocation();
  // `?refine=1`: just added with a rating, so skip the stars and go straight to comparisons.
  const refine = useSearchParams()[0].get("refine") === "1";
  const qc = useQueryClient();
  const celebrate = useCelebrate();
  const me = useMe();
  const signedIn = !!me.data?.user;
  const place = usePlace(id);
  const snapshot = useSnapshot(id, signedIn);

  const [step, setStep] = useState<Step>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const bucket: Bucket | null = rating === null ? null : bucketForRating(rating);
  const [search, setSearch] = useState<SearchState>({ lo: 0, hi: 0 });
  const [history, setHistory] = useState<SearchState[]>([]);
  const [noteValue, setNoteValue] = useState<NoteValue>({ note: "", month: null, year: null });
  const [noteInit, setNoteInit] = useState(false);
  const [noteError, setNoteError] = useState<string | undefined>(undefined);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Schemas["RankResponse"] | null>(null);

  const snap = snapshot.data;
  const itemsFor = useCallback(
    (s: Schemas["Snapshot"] | undefined, b: Bucket | null) =>
      (s?.buckets.find((x) => x.bucket === b)?.items ?? []).filter((i) => i.place_id !== id),
    [id],
  );
  const items = itemsFor(snap, bucket);

  // Prefill the stars and note from an existing ranking once.
  useEffect(() => {
    if (snap?.my_ranking && !noteInit) {
      const r = snap.my_ranking;
      setNoteValue({ note: r.note ?? "", month: r.visit_month, year: r.visit_year });
      if (r.rating) setRating(r.rating);
      setNoteInit(true);
    }
  }, [snap, noteInit]);

  const beginCompare = useCallback((list: unknown[]) => {
    const st = start(list.length);
    setSearch(st);
    setHistory([]);
    setStep(next(st) === "done" ? "note" : "compare");
  }, []);

  const chooseRating = useCallback(
    (stars: number) => {
      setRating(stars);
      setConflict(false);
      beginCompare(itemsFor(snap, bucketForRating(stars)));
    },
    [beginCompare, itemsFor, snap],
  );

  // Refining a ranking just made from stars alone: start at the comparisons.
  const [refineStarted, setRefineStarted] = useState(false);
  useEffect(() => {
    const stars = snap?.my_ranking?.rating;
    if (refine && !refineStarted && stars) {
      setRefineStarted(true);
      chooseRating(stars);
    }
  }, [refine, refineStarted, snap, chooseRating]);

  const choose = useCallback(
    (newIsBetter: boolean) => {
      const nst = answer(search, newIsBetter);
      setHistory((h) => [...h, search]);
      setSearch(nst);
      if (next(nst) === "done") setStep("note");
    },
    [search],
  );

  const back = useCallback(() => {
    if (history.length > 0) {
      setSearch(history[history.length - 1]!);
      setHistory(history.slice(0, -1));
      setStep("compare");
    } else {
      setStep("rating");
    }
  }, [history]);

  useEffect(() => {
    if (step !== "rating" && step !== "compare") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (step === "rating") {
        const stars = Number(e.key);
        if (stars >= 1 && stars <= 5) chooseRating(stars);
      } else if (e.key === "ArrowLeft" || e.key === "1") {
        choose(true);
      } else if (e.key === "ArrowRight" || e.key === "2") {
        choose(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, chooseRating, choose]);

  const save = useMutation({
    mutationFn: async () => {
      if (!snap || !bucket || rating === null) throw new Error("Nothing to save");
      const version = snap.buckets.find((b) => b.bucket === bucket)?.version ?? 0;
      return unwrap(
        await api.PUT("/api/rankings", {
          body: {
            place_id: id,
            rating,
            position: position(search),
            list_version: version,
            note: noteValue.note.trim() || null,
            visit_month: noteValue.month,
            visit_year: noteValue.year,
          },
        }),
      );
    },
    onSuccess: (res) => {
      setResult(res);
      setStep("done");
      invalidateAfterRankingChange(qc);
      track("rank", res.is_new ? "new" : "rerank");
      if (res.city_rank_count > 0 && res.city_name) {
        const msg = rankingMessage(res.city_rank_count, res.city_name);
        celebrate(msg.title, { big: msg.big });
      }
    },
    onError: async (err) => {
      const stale =
        err instanceof ApiError && err.status === 409 && typeof err.body === "object" && err.body !== null && "current_version" in err.body;
      if (stale) {
        setConflict(true);
        setError(null);
        const fresh = await snapshot.refetch();
        beginCompare(itemsFor(fresh.data, bucket));
      } else {
        setError(err.message);
      }
    },
  });

  if (!Number.isFinite(id)) return <p role="alert">Place not found</p>;
  if (me.isPending) return <Loading />;
  if (!signedIn) return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (place.error instanceof ApiError && place.error.status === 404) return <p role="alert">Place not found</p>;
  if (snapshot.isPending || place.isPending) return <Loading />;
  if (snapshot.isError || !snap || !place.data) return <p role="alert">Could not load this place for ranking.</p>;

  const p = place.data;
  const reRank = snap.my_ranking != null;
  // Back to the place card on the map (its details and reviews live there, R17.9).
  const back_to = `/?place=${p.id}`;
  const cancel = (
    <Link to={back_to} className="btn btn-secondary">
      Cancel
    </Link>
  );

  if (!snap.can_rank && !reRank) {
    return (
      <div className="space-y-3">
        <p role="alert">Reported closed: not accepting new rankings</p>
        <Link className="link" to={back_to}>
          Back to {p.name}
        </Link>
      </div>
    );
  }

  const mid = next(search);
  const other = mid === "done" ? undefined : items[mid];
  const total = items.length;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-extrabold">
        {reRank ? "Re-rate " : "Rate "}
        <PlaceNames name={p.name} nameJa={p.name_ja} as="span" />
      </h1>
      <p className="hint">
        Ranking within {p.subcategory.name} in {snap.city.name}.
      </p>

      {conflict ? (
        <p role="alert" className="card border-amber-400 bg-warning-soft text-warning-ink">
          Your list changed in another tab — let's redo the comparisons
        </p>
      ) : null}

      {step === "rating" ? (
        <section aria-labelledby="q-rating" className="space-y-3">
          <h2 id="q-rating" className="text-xl font-semibold" aria-live="polite">
            How was it?
          </h2>
          <p className="hint">Pick the stars, then Next. Or just press 1–5.</p>
          <StarRating value={rating} onChange={setRating} label="Your rating" autoFocus />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={rating === null}
              onClick={() => rating !== null && chooseRating(rating)}
            >
              Next
            </button>
            {cancel}
          </div>
        </section>
      ) : null}

      {step === "compare" && other ? (
        <section aria-labelledby="q-compare">
          <h2 id="q-compare" className="text-xl font-semibold" aria-live="polite">
            Which was better?
          </h2>
          <p className="hint">
            Comparison {history.length + 1} (at most {Math.ceil(Math.log2(total + 1))}). Use the buttons, 1 / 2 or the left / right arrow keys.
          </p>
          <div key={`${search.lo}-${search.hi}`} className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              autoFocus
              data-testid="choose-new"
              onClick={() => choose(true)}
              className="card border-brand text-left text-lg font-extrabold transition-transform hover:bg-brand-soft active:translate-y-0.5 active:border-b-2"
            >
              <span className="block text-sm font-normal text-muted">This place (1)</span>
              {p.name}
            </button>
            <button
              type="button"
              data-testid="choose-existing"
              onClick={() => choose(false)}
              className="card text-left text-lg font-extrabold transition-transform hover:bg-stone-50 active:translate-y-0.5 active:border-b-2"
            >
              <span className="block text-sm font-normal text-muted">Your #{other.position} (2)</span>
              {other.name}
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={back} className="btn btn-secondary">
              Back
            </button>
            {cancel}
          </div>
        </section>
      ) : null}

      {step === "note" ? (
        <form
          aria-labelledby="q-note"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = reviewProblem(rating, noteValue.note);
            if (problem) {
              setNoteError(problem.note ?? problem.rating);
              return;
            }
            save.mutate();
          }}
        >
          <h2 id="q-note" className="text-xl font-semibold" aria-live="polite">
            {needsComment(rating) ? "Tell others why" : "Add a comment (optional)"}
          </h2>
          <p>
            {rating ? `${rating} ★ ${RATING_LABELS[rating]} · ` : ""}#{position(search)} of {total + 1} in your{" "}
            {bucket ? BUCKET_LABEL[bucket] : ""} list.
          </p>
          <NoteFields
            value={noteValue}
            onChange={(v) => {
              setNoteValue(v);
              setNoteError(undefined);
            }}
            required={needsComment(rating)}
            error={noteError}
          />
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" autoFocus={!needsComment(rating)} disabled={save.isPending} className="btn btn-primary">
              Save
            </button>
            <button type="button" onClick={back} className="btn btn-secondary">
              Back
            </button>
            {cancel}
          </div>
        </form>
      ) : null}

      {step === "done" && result ? (
        <section aria-labelledby="q-done" className="space-y-3">
          <div role="status">
            <p aria-hidden="true" className="text-4xl">
              🎉
            </p>
            <h2 id="q-done" className="text-2xl font-extrabold">
              Saved
            </h2>
            {result.city_rank_count > 0 ? (
              <p className="font-bold text-success-dark">{rankingMessage(result.city_rank_count, result.city_name).title}</p>
            ) : null}
          </div>
          <ol className="divide-y divide-line">
            {result.rank_list.items.map((it) => (
              <li key={it.ranking_id} className={`flex justify-between gap-2 py-2 ${it.place_id === id ? "font-bold" : ""}`}>
                <span>
                  {it.position}. <PlaceNames name={it.name} nameJa={it.name_ja} as="span" />
                </span>
                <span>{it.personal_score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
          <p className="flex gap-3">
            <Link className="link" to="/lists?tab=mine">
              My rankings
            </Link>
            <Link className="link" to={back_to}>
              Back to {p.name}
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
