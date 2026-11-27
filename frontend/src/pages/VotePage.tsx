import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { ApiError } from "../api/client";
import Loading from "../components/ui/Loading";
import PlaceArt from "../components/ui/PlaceArt";
import ReviewPeek from "../components/ui/ReviewPeek";
import {
  castVote,
  evidenceLine,
  progressLine,
  useDone,
  useSetName,
  useVoteList,
  type Choice,
  type VoteItem,
} from "../hooks/voting";
import { voterId } from "../lib/voterId";
import { useInlineSignIn } from "../components/app/InlineSignIn";
import ListMap from "../components/lists/ListMap";
import { googleMapsUrl, useSaveListPlaces } from "../hooks/myLists";
import { TOP_CATEGORY_INFO, topCategoryInfo } from "../lib/categories";
import { track } from "../lib/track";

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
  voting,
  choice,
  status,
  error,
  onChoose,
  onRetry,
}: {
  item: VoteItem;
  /** "Let friends vote" is on: show Yes / Maybe / No. */
  voting: boolean;
  choice: Choice | null;
  status: Status | null;
  error: string | null;
  onChoose: (c: Choice) => void;
  onRetry: () => void;
}) {
  const id = useId();
  const evidence = evidenceLine(item.curator_count, item.evidence_updated);
  return (
    <li className="card space-y-3 p-2 pb-3" aria-labelledby={`${id}-name`}>
      {/* Poster (Partiful-style): the place's art with its name on it. */}
      <PlaceArt
        id={item.place.id}
        subcategorySlug={item.place.subcategory.slug}
        topCategory={item.place.subcategory.top_category}
        variant="banner"
        image={item.place.image}
        className="min-h-32"
      >
        <h3 id={`${id}-name`} className="font-display text-2xl font-black leading-tight text-white [text-shadow:0_2px_8px_rgb(0_0_0/0.35)]">
          {item.place.name}
        </h3>
        <p className="text-sm font-bold text-white/90">
          {item.place.name_ja ? (
            <span lang="ja" className="block">
              {item.place.name_ja}
            </span>
          ) : null}
          {placeLine(item)}
        </p>
      </PlaceArt>
      {evidence ? <p className="px-1 text-sm font-bold text-muted">{evidence}</p> : null}
      {/* A sneak peek of what people say (decided 2026-11-27). */}
      <ReviewPeek peek={item.place.peek} className="mx-1 rounded-xl border-l-4 border-brand bg-brand-soft px-3 py-2" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
        <a href={googleMapsUrl(item.place)} target="_blank" rel="noopener noreferrer" className="link">
          Open in Google Maps<span className="sr-only"> (opens a new tab)</span>
        </a>
        {item.tally && item.tally.yes + item.tally.maybe + item.tally.no > 0 ? (
          <span className="font-bold text-muted" aria-label={`Votes so far: ${item.tally.yes} yes, ${item.tally.maybe} maybe, ${item.tally.no} no`}>
            ✅ {item.tally.yes} · 🤔 {item.tally.maybe} · ✖️ {item.tally.no}
          </span>
        ) : null}
      </div>
      {voting ? (
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
      ) : null}
      <p aria-live="polite" className="min-h-5 px-1 text-sm">
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
  const opened = useRef(false);
  useEffect(() => {
    if (q.data && !opened.current) {
      opened.current = true;
      if (!q.data.is_owner) track("share_open");
    }
  }, [q.data]);

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
  const voting = list.is_open;

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
        {voting ? <p className="text-lg font-bold">Tap yes, maybe or no.</p> : null}
        {list.voter_count > 0 ? (
          <p className="text-sm font-bold text-muted">{progressLine(list.voter_count, list.group_size)} so far.</p>
        ) : null}
        {voting ? (
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
        ) : null}
      </header>

      {list.is_owner ? (
        <p className="card bg-brand-soft p-3 text-sm font-bold">
          This is your list.{" "}
          <Link to="/lists?tab=shared" className="link">
            Edit it in Shared lists
          </Link>
        </p>
      ) : null}

      <ListMap places={list.items.map((i) => i.place)} />

      <SaveAll token={token} />

      {voting ? <NameField token={token} voter={voter} organizer={list.organizer_name} initial={list.me?.name ?? ""} /> : null}

      {groupByCategory(list.items).map(([top, items]) => (
      <section key={top} aria-label={topCategoryInfo(top)?.name ?? top} className="space-y-3">
        <h2 className="font-display text-xl font-black">
          <span aria-hidden="true">{topCategoryInfo(top)?.emoji} </span>
          {topCategoryInfo(top)?.name ?? top}
        </h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <VoteCard
            key={item.item_id}
            voting={voting}
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
      </section>
      ))}

      {/* Sticky Done (V1.6), only while voting is on. */}
      {voting ? (
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
      ) : null}
    </main>
  );
}

/** Places grouped by category (Food, Sights…), in the list's order within each. */
function groupByCategory(items: VoteItem[]): [string, VoteItem[]][] {
  const groups = new Map<string, VoteItem[]>();
  for (const it of items) {
    const top = it.place.subcategory.top_category;
    groups.set(top, [...(groups.get(top) ?? []), it]);
  }
  const order = TOP_CATEGORY_INFO.map((c) => c.slug as string);
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

/** "Save these places": all of them onto your Want to go (decided 2026-11-27). */
function SaveAll({ token }: { token: string }) {
  const { requireUser } = useInlineSignIn();
  const save = useSaveListPlaces(token);
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="btn btn-secondary w-full"
        disabled={save.isPending}
        onClick={() =>
          requireUser(
            () => save.mutate(undefined, { onSuccess: () => track("share_save") }),
            "Pick a username to save these places",
          )
        }
      >
        <span aria-hidden="true">🔖</span> {save.isPending ? "Saving…" : "Save these places"}
      </button>
      <p aria-live="polite" className="text-center text-sm font-bold text-success-dark">
        {save.data
          ? save.data.saved
            ? `Saved ${save.data.saved} ${save.data.saved === 1 ? "place" : "places"} to your Want to go.`
            : "They're all on your lists already."
          : ""}
      </p>
    </div>
  );
}
