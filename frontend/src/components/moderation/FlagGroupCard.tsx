import { useState } from "react";
import { Link } from "react-router";

import type { Schemas } from "../../api/client";
import { useAdminAction, type AdminAction } from "../../hooks/moderation";
import Badges from "../Badges";
import PinMap from "../PinMap";
import Score from "../Score";
import Dialog from "./Dialog";
import { adminErrorMessage } from "./errors";

type Group = Schemas["FlagGroup"];
type Flag = Schemas["FlagOut"];
type Place = Schemas["PlaceSummary"];

export const FLAG_LABEL: Record<string, string> = {
  closed: "Closed",
  wrong_location: "Wrong location",
  wrong_info: "Wrong info",
  duplicate: "Duplicate",
  spam: "Fake or spam",
};

const btn = "rounded border border-stone-400 px-3 py-1.5 text-sm font-medium text-stone-900 hover:bg-stone-100 disabled:opacity-60";

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function countsSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${FLAG_LABEL[k] ?? k} ×${n}`)
    .join(", ");
}

/** Which place-level actions apply, from the place's badges. */
export function placeActions(badges: readonly string[]) {
  return {
    hidden: badges.includes("hidden"),
    closed: badges.includes("closed") || badges.includes("reported_closed"),
  };
}

export default function FlagGroupCard({ group }: { group: Group }) {
  const mutation = useAdminAction();
  const [merge, setMerge] = useState<{ from: Place; into: Place } | null>(null);
  const place = group.place;
  const run = (a: AdminAction) => mutation.mutate(a);

  const state = place ? placeActions(place.badges) : null;
  const label = place?.name ?? group.key;

  return (
    <li className="rounded border border-stone-300 bg-white p-3" aria-label={`Flags for ${label}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">
            {place ? (
              <Link to={`/places/${place.id}`} className="underline">
                {place.name}
              </Link>
            ) : (
              group.key
            )}
            {place?.name_ja && (
              <span lang="ja" className="ml-2 font-normal">
                {place.name_ja}
              </span>
            )}
          </h2>
          {place && (
            <p className="text-sm text-stone-700">
              {place.subcategory.name} · {place.location.name}, {place.city.name}{" "}
              <Score score={place.public_score} rankerCount={place.ranker_count} />
            </p>
          )}
          {place && <Badges badges={place.badges} />}
        </div>
        <p className="text-sm text-stone-700">{group.target_type === "note" ? "Note · " : ""}{countsSummary(group.counts)}</p>
      </div>

      {group.note && (
        <blockquote className="my-2 border-l-4 border-stone-400 pl-3">
          <p className="whitespace-pre-wrap">{group.note.note ?? <em>(note already removed)</em>}</p>
          <footer className="text-sm text-stone-700">
            by {group.note.author}
            {group.note.author_is_private ? " (private profile)" : ""}
          </footer>
        </blockquote>
      )}

      <ul className="my-2 space-y-2">
        {group.flags.map((f) => (
          <FlagRow key={f.id} flag={f} place={place} run={run} onMerge={setMerge} busy={mutation.isPending} />
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {place && state && (
          <>
            <button type="button" className={btn} disabled={mutation.isPending} onClick={() => run({ kind: state.hidden ? "unhide" : "hide", placeId: place.id })}>
              {state.hidden ? "Unhide" : "Hide"}
            </button>
            <button type="button" className={btn} disabled={mutation.isPending} onClick={() => run({ kind: state.closed ? "reopen" : "close", placeId: place.id })}>
              {state.closed ? "Reopen" : "Close"}
            </button>
            <Link to={`/places/${place.id}/edit`} className={btn}>
              Edit place
            </Link>
          </>
        )}
        {group.target_type === "note" && group.note && (
          <button type="button" className={btn} disabled={mutation.isPending} onClick={() => run({ kind: "removeNote", rankingId: group.note!.ranking_id })}>
            Remove note
          </button>
        )}
      </div>

      <div aria-live="polite">
        {mutation.error && (
          <p role="alert" className="mt-2 text-red-800">
            {adminErrorMessage(mutation.error)}
          </p>
        )}
      </div>

      {merge && (
        <Dialog title="Merge places?" onClose={() => setMerge(null)}>
          <p className="mb-3">
            Merge <strong>{merge.from.name}</strong> (#{merge.from.id}) into <strong>{merge.into.name}</strong> (#{merge.into.id}).
            Rankings and bookmarks move to the surviving place and <strong>{merge.from.name}</strong> disappears. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded border border-stone-400 px-4 py-2" onClick={() => setMerge(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-brand px-4 py-2 font-medium text-white"
              onClick={() => {
                run({ kind: "merge", placeId: merge.from.id, intoPlaceId: merge.into.id });
                setMerge(null);
              }}
            >
              Confirm merge
            </button>
          </div>
        </Dialog>
      )}
    </li>
  );
}

function FlagRow({
  flag,
  place,
  run,
  onMerge,
  busy,
}: {
  flag: Flag;
  place: Place | null;
  run: (a: AdminAction) => void;
  onMerge: (m: { from: Place; into: Place }) => void;
  busy: boolean;
}) {
  const payload = (flag.payload ?? {}) as { lat?: number; lng?: number; name?: string; name_ja?: string };
  const isOpen = flag.status === "open";
  const dup = flag.duplicate_place;
  return (
    <li className="rounded bg-stone-50 p-2">
      <p className="text-sm">
        <strong>{FLAG_LABEL[flag.flag_type] ?? flag.flag_type}</strong> by {flag.flagger} · {formatWhen(flag.created_at)}
        {!isOpen && <span className="ml-2 text-stone-700">({flag.status})</span>}
      </p>

      {flag.flag_type === "wrong_location" && typeof payload.lat === "number" && typeof payload.lng === "number" && (
        <div className="my-1">
          <p className="text-sm">
            Suggested pin: {payload.lat.toFixed(5)}, {payload.lng.toFixed(5)}
          </p>
          <PinMap lat={payload.lat} lng={payload.lng} height={160} />
        </div>
      )}

      {flag.flag_type === "wrong_info" && (
        <ul className="my-1 list-disc pl-5 text-sm">
          {payload.name !== undefined && <li>Name: {payload.name}</li>}
          {payload.name_ja !== undefined && (
            <li>
              Japanese name: <span lang="ja">{payload.name_ja || "(clear)"}</span>
            </li>
          )}
          {flag.suggested_subcategory && <li>Subcategory: {flag.suggested_subcategory.name}</li>}
          {flag.suggested_location && <li>Location: {flag.suggested_location.name}</li>}
        </ul>
      )}

      {flag.flag_type === "duplicate" && dup && (
        <p className="my-1 text-sm">
          Duplicate of{" "}
          <Link to={`/places/${dup.id}`} className="underline">
            {dup.name}
          </Link>{" "}
          (#{dup.id}, {dup.location.name})
        </p>
      )}

      {isOpen && (
        <div className="mt-1 flex flex-wrap gap-2">
          {(flag.flag_type === "wrong_location" || flag.flag_type === "wrong_info") && (
            <button type="button" className={btn} disabled={busy} onClick={() => run({ kind: "apply", flagId: flag.id })}>
              Apply
            </button>
          )}
          {flag.flag_type === "duplicate" && dup && place && (
            <>
              <button type="button" className={btn} disabled={busy} onClick={() => onMerge({ from: place, into: dup })}>
                Merge {place.name} into {dup.name}
              </button>
              <button type="button" className={btn} disabled={busy} onClick={() => onMerge({ from: dup, into: place })}>
                Merge {dup.name} into {place.name}
              </button>
            </>
          )}
          <button type="button" className={btn} disabled={busy} onClick={() => run({ kind: "dismiss", flagId: flag.id })}>
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}
