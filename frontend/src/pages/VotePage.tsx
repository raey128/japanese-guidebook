import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { ApiError } from "../api/client";
import PlaceNames from "../components/PlaceNames";
import Loading from "../components/ui/Loading";
import {
  castVote,
  evidenceLine,
  progressLine,
  useDone,
  useSetName,
  useVoteList,
  type Choice,
  type VoteItem,
  type VoteList,
} from "../hooks/voting";
import { topCategoryInfo } from "../lib/categories";
import { voterId } from "../lib/voterId";

type Status = "saving" | "saved" | "error";

const CHOICES: { key: Choice; label: string; icon: string; on: string }[] = [
  { key: "yes", label: "Yes", icon: "✅", on: "border-success-dark bg-success text-white" },
  { key: "maybe", label: "Maybe", icon: "🤔", on: "border-warning-ink bg-warning-soft text-warning-ink" },
  { key: "no", label: "No", icon: "✖️", on: "border-ink bg-ink text-white" },
];

function placeLine(item: VoteItem): string {
  const p = item.place;
  const area = p.location.is_catch_all ? p.city.name : p.location.name;
  return `${area} · ${p.subcategory.name}`;
}

/** One place: name, area and category, the curator evidence, and Yes / Maybe / No (V1.5). */
function VoteCard({
  item,
  choice,
  status,
  error,
  onChoose,
  onRetry,
}: {
  item: VoteItem;
  choice: Choice | null;
  status: Status | null;
  error: string | null;
  onChoose: (c: Choice) => void;
  onRetry: () => void;
}) {
  const id = useId();
  const info = topCategoryInfo(item.place.subcategory.top_category);
  const evidence = evidenceLine(item.curator_count, item.evidence_updated);
  return (
    <li className="card space-y-3" aria-labelledby={`${id}-name`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl"
          style={{ background: info?.iconBg ?? info?.color }}
        >
          {info?.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-name`} className="text-lg font-extrabold leading-tight">
            <PlaceNames name={item.place.name} nameJa={item.place.name_ja} as="span" />
          </h2>
          <p className="text-sm font-bold text-muted">{placeLine(item)}</p>
          {evidence ? <p className="text-sm text-muted">{evidence}</p> : null}
        </div>
      </div>
      <div role="group" aria-labelledby={`${id}-name`} className="grid grid-cols-3 gap-2">
        {CHOICES.map((c) => {
          const pressed = choice === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChoose(c.key)}
              className={`btn min-h-12 gap-1.5 px-2 text-base ${pressed ? c.on : "btn-secondary"}`}
            >
              <span aria-hidden="true">{c.icon}</span> {c.label}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm">
        {status === "saving" ? <span className="text-muted">Saving…</span> : null}
        {status === "saved" ? <span className="font-bold text-success-dark">Saved</span> : null}
        {status === "error" ? (
          <span className="text-danger">
            {error ?? "Couldn't save."}{" "}
            <button type="button" className="link" onClick={onRetry}>
              Retry
            </button>
          </span>
        ) : null}
      </p>
    </li>
  );
}

/** "Your name, so Maya knows it's you": optional, open, saved when you leave the field. */
function NameField({ token, voter, organizer, initial }: { token: string; voter: string; organizer: string; initial: string }) {
  const id = useId();
  const [name, setName] = useState(initial);
  const saved = useRef(initial);
  const save = useSetName(token, voter);
  const commit = () => {
    if (name.trim() === saved.current.trim()) return;
    save.mutate(name, { onSuccess: () => (saved.current = name) });
  };
  return (
    <div className="card space-y-1 p-3">
      <label htmlFor={id} className="label">
        Your name, so {organizer} knows it's you <span className="font-normal text-muted">(optional)</span>
      </label>
      <input
        id={id}
        value={name}
        maxLength={40}
        autoComplete="given-name"
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="field"
      />
      <p aria-live="polite" className="min-h-5 text-sm">
        {save.isPending ? <span className="text-muted">Saving…</span> : null}
        {save.isSuccess && !save.isPending ? <span className="font-bold text-success-dark">Saved</span> : null}
        {save.isError ? (
          <span className="text-danger">
            Couldn't save your name.{" "}
            <button type="button" className="link" onClick={commit}>
              Retry
            </button>
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** Voting closed: read-only results, most yeses first (V1.7). */
function Results({ list }: { list: VoteList }) {
  const items = [...list.items].sort((a, b) => (b.tally?.yes ?? 0) - (a.tally?.yes ?? 0) || (a.tally?.no ?? 0) - (b.tally?.no ?? 0));
  return (
    <>
      <header className="space-y-1">
        <p className="text-sm font-extrabold uppercase tracking-wide text-muted">{list.title}</p>
        <h1 className="text-2xl font-extrabold">Voting has closed</h1>
        <p className="text-muted">
          Here's how it went: {progressLine(list.voter_count, list.group_size)} on {list.organizer_name}'s {list.item_count}{" "}
          places.
        </p>
      </header>
      <ol className="space-y-3">
        {items.map((item) => {
          const t = item.tally;
          return (
            <li key={item.item_id} className="card space-y-2">
              <h2 className="text-lg font-extrabold leading-tight">
                <PlaceNames name={item.place.name} nameJa={item.place.name_ja} as="span" />
              </h2>
              <p className="text-sm font-bold text-muted">{placeLine(item)}</p>
              {t ? (
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {CHOICES.map((c) => {
                    const names = t[`${c.key}_names` as "yes_names"];
                    return (
                      <div key={c.key} className="rounded-xl bg-stone-50 px-2 py-1.5">
                        <dt className="text-xs font-extrabold uppercase text-muted">
                          <span aria-hidden="true">{c.icon} </span>
                          {c.label}
                        </dt>
                        <dd className="text-xl font-extrabold">{t[c.key]}</dd>
                        {names.length ? <dd className="truncate text-xs text-muted">{names.join(", ")}</dd> : null}
                      </div>
                    );
                  })}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * The vote page (V1, the product under test): "Maya picked 12 places for Tokyo. Tap yes, maybe
 * or no." No account; every tap saves straight away; Done shows how many friends have voted.
 */
export default function VotePage() {
  const { token = "" } = useParams();
  const voter = useMemo(() => voterId(), []);
  const q = useVoteList(token, voter);
  const done = useDone(token, voter);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const [finished, setFinished] = useState(false);
  const seq = useRef<Record<number, number>>({});

  // Start from what this browser already voted.
  useEffect(() => {
    if (!q.data) return;
    setChoices((prev) => {
      const next = { ...prev };
      for (const i of q.data.items) if (i.my_choice && !(i.item_id in next)) next[i.item_id] = i.my_choice;
      return next;
    });
  }, [q.data]);

  const send = (itemId: number, choice: Choice) => {
    const n = (seq.current[itemId] ?? 0) + 1;
    seq.current[itemId] = n;
    setStatus((s) => ({ ...s, [itemId]: "saving" }));
    castVote(token, voter, itemId, choice).then(
      () => {
        if (seq.current[itemId] === n) setStatus((s) => ({ ...s, [itemId]: "saved" }));
      },
      (e: unknown) => {
        if (seq.current[itemId] !== n) return;
        setStatus((s) => ({ ...s, [itemId]: "error" }));
        setErrors((x) => ({ ...x, [itemId]: e instanceof ApiError && e.status !== 500 ? e.message : null }));
      },
    );
  };

  if (q.isPending) return <Loading />;
  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-10 text-center">
        <p aria-hidden="true" className="text-5xl">
          🔗
        </p>
        <h1 className="text-2xl font-extrabold">This link doesn't work</h1>
        <p className="text-muted">Ask the person who sent it for a new one.</p>
      </main>
    );
  }
  if (q.isError || !q.data) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-10 text-center">
        <h1 className="text-2xl font-extrabold">Couldn't load the places</h1>
        <button type="button" className="btn btn-primary" onClick={() => void q.refetch()}>
          Try again
        </button>
      </main>
    );
  }

  const list = q.data;
  if (!list.is_open) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <Results list={list} />
      </main>
    );
  }

  const votedCount = list.items.filter((i) => choices[i.item_id]).length;

  if (finished && done.data) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-10">
        <div role="status" className="space-y-2 text-center">
          <p aria-hidden="true" className="text-5xl">
            🎉
          </p>
          <h1 className="text-2xl font-extrabold">Thanks. {progressLine(done.data.voter_count, done.data.group_size)}.</h1>
          <p className="text-muted">You can change your votes until {list.organizer_name} closes voting.</p>
          <button type="button" className="link" onClick={() => setFinished(false)}>
            Change my votes
          </button>
        </div>
        <div className="card space-y-2 text-center">
          <p className="font-extrabold">Planning your own trip?</p>
          <Link to="/" className="btn btn-primary w-full">
            Start a list
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 pb-32 pt-6">
      <header className="space-y-1">
        <p className="text-sm font-extrabold uppercase tracking-wide text-muted">{list.title}</p>
        <h1 className="text-2xl font-extrabold leading-tight">
          {list.organizer_name} picked {list.item_count} {list.item_count === 1 ? "place" : "places"} for {list.city.name}.
        </h1>
        <p className="text-lg font-bold">Tap yes, maybe or no.</p>
        <div className="flex items-center gap-3 pt-1">
          <div
            role="progressbar"
            aria-label="Places you've voted on"
            aria-valuemin={0}
            aria-valuemax={list.item_count}
            aria-valuenow={votedCount}
            className="h-3 flex-1 overflow-hidden rounded-full bg-stone-200"
          >
            <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(votedCount / Math.max(1, list.item_count)) * 100}%` }} />
          </div>
          <span className="text-sm font-extrabold" aria-hidden="true">
            {votedCount} of {list.item_count}
          </span>
        </div>
      </header>

      <NameField token={token} voter={voter} organizer={list.organizer_name} initial={list.me?.name ?? ""} />

      <ul className="space-y-3">
        {list.items.map((item) => (
          <VoteCard
            key={item.item_id}
            item={item}
            choice={choices[item.item_id] ?? null}
            status={status[item.item_id] ?? null}
            error={errors[item.item_id] ?? null}
            onChoose={(c) => {
              setChoices((x) => ({ ...x, [item.item_id]: c }));
              send(item.item_id, c);
            }}
            onRetry={() => {
              const c = choices[item.item_id];
              if (c) send(item.item_id, c);
            }}
          />
        ))}
      </ul>

      {/* Sticky Done (V1.6). */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <p className="flex-1 text-sm font-bold text-muted">
            {votedCount} of {list.item_count} voted
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={done.isPending}
            onClick={() => done.mutate(undefined, { onSuccess: () => setFinished(true) })}
          >
            {done.isPending ? "Saving…" : "Done"}
          </button>
        </div>
        {done.isError ? (
          <p role="alert" className="mx-auto mt-1 max-w-md text-sm text-danger">
            Couldn't reach the server. Your votes are saved; try Done again.
          </p>
        ) : null}
      </div>
    </main>
  );
}
