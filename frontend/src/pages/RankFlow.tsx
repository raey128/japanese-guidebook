import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";

import { api, ApiError, unwrap, type Schemas } from "../api/client";
import NoteFields, { type NoteValue } from "../components/ranking/NoteFields";
import PlaceNames from "../components/PlaceNames";
import { useMe } from "../hooks/auth";
import { invalidateAfterRankingChange, usePlace, useSnapshot } from "../hooks/ranking";
import { answer, next, position, start, type SearchState } from "../lib/binarySearch";

type Bucket = Schemas["MyRanking"]["bucket"];
type Step = "bucket" | "compare" | "note" | "done";

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  { key: "liked", label: "Liked", hint: "I'd go back or recommend it" },
  { key: "fine", label: "Fine", hint: "It was okay" },
  { key: "disliked", label: "Disliked", hint: "I wouldn't go again" },
];

function isTyping(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT");
}

export default function RankFlow() {
  const id = Number(useParams().id);
  const loc = useLocation();
  const qc = useQueryClient();
  const me = useMe();
  const signedIn = !!me.data?.user;
  const place = usePlace(id);
  const snapshot = useSnapshot(id, signedIn);

  const [step, setStep] = useState<Step>("bucket");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [search, setSearch] = useState<SearchState>({ lo: 0, hi: 0 });
  const [history, setHistory] = useState<SearchState[]>([]);
  const [noteValue, setNoteValue] = useState<NoteValue>({ note: "", month: null, year: null });
  const [noteInit, setNoteInit] = useState(false);
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

  // Prefill the note step from an existing ranking once.
  useEffect(() => {
    if (snap?.my_ranking && !noteInit) {
      const r = snap.my_ranking;
      setNoteValue({ note: r.note ?? "", month: r.visit_month, year: r.visit_year });
      setNoteInit(true);
    }
  }, [snap, noteInit]);

  const beginCompare = useCallback((list: unknown[]) => {
    const st = start(list.length);
    setSearch(st);
    setHistory([]);
    setStep(next(st) === "done" ? "note" : "compare");
  }, []);

  const chooseBucket = useCallback(
    (b: Bucket) => {
      setBucket(b);
      setConflict(false);
      beginCompare(itemsFor(snap, b));
    },
    [beginCompare, itemsFor, snap],
  );

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
      setStep("bucket");
    }
  }, [history]);

  useEffect(() => {
    if (step !== "bucket" && step !== "compare") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (step === "bucket") {
        const b = BUCKETS[Number(e.key) - 1];
        if (b) chooseBucket(b.key);
      } else if (e.key === "ArrowLeft" || e.key === "1") {
        choose(true);
      } else if (e.key === "ArrowRight" || e.key === "2") {
        choose(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, chooseBucket, choose]);

  const save = useMutation({
    mutationFn: async () => {
      if (!snap || !bucket) throw new Error("Nothing to save");
      const version = snap.buckets.find((b) => b.bucket === bucket)?.version ?? 0;
      return unwrap(
        await api.PUT("/api/rankings", {
          body: {
            place_id: id,
            bucket,
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
  if (me.isPending) return <p role="status">Loading…</p>;
  if (!signedIn) return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (place.error instanceof ApiError && place.error.status === 404) return <p role="alert">Place not found</p>;
  if (snapshot.isPending || place.isPending) return <p role="status">Loading…</p>;
  if (snapshot.isError || !snap || !place.data) return <p role="alert">Could not load this place for ranking.</p>;

  const p = place.data;
  const reRank = snap.my_ranking != null;
  const back_to = `/places/${p.id}`;
  const cancel = (
    <Link to={back_to} className="rounded border border-stone-400 px-3 py-2">
      Cancel
    </Link>
  );

  if (!snap.can_rank && !reRank) {
    return (
      <div className="space-y-3">
        <p role="alert">Reported closed: not accepting new rankings</p>
        <Link className="underline" to={back_to}>
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
      <h1 className="text-2xl font-bold">
        {reRank ? "Re-rank " : "Rank "}
        <PlaceNames name={p.name} nameJa={p.name_ja} as="span" />
      </h1>
      <p className="text-sm text-stone-700">
        Ranking within {p.subcategory.name} in {snap.city.name}.
      </p>

      {conflict ? (
        <p role="alert" className="rounded border border-amber-600 bg-amber-50 p-2 text-stone-900">
          Your list changed in another tab — let's redo the comparisons
        </p>
      ) : null}

      {step === "bucket" ? (
        <section aria-labelledby="q-bucket">
          <h2 id="q-bucket" className="text-xl font-semibold" aria-live="polite">
            How was it?
          </h2>
          <div className="mt-3 grid gap-3">
            {BUCKETS.map((b, i) => (
              <button
                key={b.key}
                type="button"
                autoFocus={i === 0}
                onClick={() => chooseBucket(b.key)}
                className="rounded border-2 border-stone-500 p-4 text-left text-lg font-semibold hover:bg-stone-100"
              >
                {b.label}
                <span className="block text-sm font-normal text-stone-700">{b.hint} (press {i + 1})</span>
              </button>
            ))}
          </div>
          <div className="mt-4">{cancel}</div>
        </section>
      ) : null}

      {step === "compare" && other ? (
        <section aria-labelledby="q-compare">
          <h2 id="q-compare" className="text-xl font-semibold" aria-live="polite">
            Which was better?
          </h2>
          <p className="text-sm text-stone-700">
            Comparison {history.length + 1} (at most {Math.ceil(Math.log2(total + 1))}). Use the buttons, 1 / 2 or the left / right arrow keys.
          </p>
          <div key={`${search.lo}-${search.hi}`} className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              autoFocus
              data-testid="choose-new"
              onClick={() => choose(true)}
              className="rounded border-2 border-brand p-4 text-left text-lg font-semibold hover:bg-red-50"
            >
              <span className="block text-sm font-normal text-stone-700">This place (1)</span>
              {p.name}
            </button>
            <button
              type="button"
              data-testid="choose-existing"
              onClick={() => choose(false)}
              className="rounded border-2 border-stone-500 p-4 text-left text-lg font-semibold hover:bg-stone-100"
            >
              <span className="block text-sm font-normal text-stone-700">Your #{other.position} (2)</span>
              {other.name}
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={back} className="rounded border border-stone-400 px-3 py-2">
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
            save.mutate();
          }}
        >
          <h2 id="q-note" className="text-xl font-semibold" aria-live="polite">
            Add a note (optional)
          </h2>
          <p>
            Position: #{position(search)} of {total + 1} in your {BUCKETS.find((b) => b.key === bucket)?.label} list.
          </p>
          <NoteFields value={noteValue} onChange={setNoteValue} />
          {error ? (
            <p role="alert" className="text-red-800">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" autoFocus disabled={save.isPending} className="rounded bg-brand px-4 py-2 font-medium text-white">
              Save
            </button>
            <button type="button" onClick={back} className="rounded border border-stone-400 px-3 py-2">
              Back
            </button>
            {cancel}
          </div>
        </form>
      ) : null}

      {step === "done" && result ? (
        <section aria-labelledby="q-done" className="space-y-3">
          <div role="status">
            <h2 id="q-done" className="text-xl font-semibold">
              Saved
            </h2>
          </div>
          <ol className="divide-y divide-stone-300">
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
            <Link className="underline" to="/me/rankings">
              My rankings
            </Link>
            <Link className="underline" to={back_to}>
              Back to {p.name}
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
