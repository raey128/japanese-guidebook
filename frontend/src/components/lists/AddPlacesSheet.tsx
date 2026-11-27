import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Schemas } from "../../api/client";
import { useBookmarks, useSearchPlaces } from "../../hooks/lists";
import { useAddItems } from "../../hooks/myLists";
import { useMyRankings } from "../../hooks/ranking";
import Chip from "../ui/Chip";
import PlaceArt from "../ui/PlaceArt";

type Row = {
  id: number;
  name: string;
  slug: string;
  top: string;
  line: string;
  image?: Schemas["PlaceImage"] | null;
};

type Source = "been" | "want" | "search";

function fromSummary(p: Schemas["PlaceSummary"]): Row {
  return {
    id: p.id,
    name: p.name,
    slug: p.subcategory.slug,
    top: p.subcategory.top_category,
    line: `${p.subcategory.name} · ${p.location.is_catch_all ? p.city.name : p.location.name}`,
    image: p.image,
  };
}

/**
 * Add many places to a list at once (decided 2026-11-27): tick them from Been there, Want to go
 * or a search, then "Add 5". Places already on the list are marked; other cities aren't offered.
 */
export default function AddPlacesSheet({
  listId,
  city,
  onList,
  onClose,
}: {
  listId: number;
  city: Schemas["CityOut"];
  onList: Set<number>;
  onClose: () => void;
}) {
  const id = useId();
  const add = useAddItems(listId);
  const [source, setSource] = useState<Source>("been");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const been = useMyRankings();
  const want = useBookmarks();
  const search = useSearchPlaces({ q, city: city.slug, location: "", category: "" });
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    if (source === "been") {
      const c = been.data?.cities.find((x) => x.city.id === city.id);
      const items = c?.categories.flatMap((cat) =>
        cat.buckets.flatMap((b) =>
          b.items.map((it) => ({
            id: it.place_id,
            name: it.name,
            slug: cat.subcategory.slug,
            top: cat.subcategory.top_category,
            line: cat.subcategory.name,
          })),
        ),
      );
      return items ?? [];
    }
    if (source === "want") return (want.data?.items ?? []).filter((p) => p.city.id === city.id).map(fromSummary);
    return (search.data?.items ?? []).map((p) => fromSummary(p as unknown as Schemas["PlaceSummary"]));
  }, [source, been.data, want.data, search.data, city.id]);

  const toggle = (pid: number) => setPicked((p) => (p.includes(pid) ? p.filter((x) => x !== pid) : [...p, pid]));
  const loading = source === "been" ? been.isPending : source === "want" ? want.isPending : search.isFetching;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-h`}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-(--radius-card) bg-white shadow-xl sm:rounded-(--radius-card)"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-center gap-2 border-b-2 border-line p-3">
          <h2 id={`${id}-h`} className="flex-1 font-display text-xl font-black">
            Add places in {city.name}
          </h2>
          <button ref={close} type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-2 p-3">
          <div role="group" aria-label="Pick from" className="flex gap-2">
            {(
              [
                ["been", "Been there"],
                ["want", "Want to go"],
                ["search", "Search"],
              ] as const
            ).map(([k, label]) => (
              <Chip key={k} pressed={source === k} onClick={() => setSource(k)}>
                {label}
              </Chip>
            ))}
          </div>
          {source === "search" ? (
            <>
              <label htmlFor={`${id}-q`} className="sr-only">
                Search places
              </label>
              <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="field" autoFocus />
            </>
          ) : null}
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Places to pick">
          {loading && rows.length === 0 ? <li className="hint p-2">Loading…</li> : null}
          {!loading && rows.length === 0 ? (
            <li className="hint p-2">{source === "search" ? (q ? "Nothing found." : "Type a name.") : "Nothing here in this city yet."}</li>
          ) : null}
          {rows.map((r) => {
            const already = onList.has(r.id);
            const on = picked.includes(r.id);
            return (
              <li key={r.id}>
                <label className={`flex items-center gap-3 rounded-xl p-2 ${already ? "opacity-60" : "cursor-pointer hover:bg-stone-50"} ${on ? "bg-brand-soft" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on || already}
                    disabled={already}
                    onChange={() => toggle(r.id)}
                    className="size-5 shrink-0 accent-[var(--color-brand)]"
                  />
                  <PlaceArt id={r.id} subcategorySlug={r.slug} topCategory={r.top} image={r.image} className="size-12 text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{r.name}</span>
                    <span className="block truncate text-xs text-muted">{already ? "Already on the list" : r.line}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="border-t-2 border-line p-3">
          {add.isError ? (
            <p role="alert" className="mb-2 text-sm text-danger">
              {add.error.message}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={picked.length === 0 || add.isPending}
            onClick={() => add.mutate(picked, { onSuccess: onClose })}
          >
            {add.isPending ? "Adding…" : picked.length ? `Add ${picked.length} ${picked.length === 1 ? "place" : "places"}` : "Tick places to add"}
          </button>
        </div>
      </div>
    </div>
  );
}
