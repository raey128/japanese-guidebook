import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router";

import type { Schemas } from "../../api/client";
import { useSuggest } from "../../hooks/map";
import { usePlaceLookup } from "../../hooks/places";

export type LookupPick = Schemas["PlaceLookupResult"];

type Props = {
  inputId: string;
  value: string;
  onChange: (text: string) => void;
  /** A business from OpenStreetMap: the form fills in the address and drops the pin. */
  onPick: (r: LookupPick) => void;
  /** Bias the search towards here (the pin, or the current city's centre). */
  near: { lat: number; lng: number } | null;
  /** City slug for "already on the map" matches. */
  city: string;
  invalid?: boolean;
  describedBy?: string;
};

type Option =
  | { kind: "existing"; key: string; place: Schemas["PlaceSummary"] }
  | { kind: "osm"; key: string; result: LookupPick };

/**
 * The name field on Add a place (R13.6): as you type it suggests places already in the app
 * (open those instead of adding a duplicate) and businesses found on OpenStreetMap (pick one
 * and the address and pin fill in). Typing a name that isn't listed is always fine.
 */
export default function PlaceNameLookup({ inputId, value, onChange, onPick, near, city, invalid, describedBy }: Props) {
  const listId = useId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  const term = debounced.trim();
  const existing = useSuggest(open ? term : "", city, "", null);
  const lookup = usePlaceLookup(open ? term : "", near);

  const existingPlaces = [...(existing.data?.on_map ?? []), ...(existing.data?.elsewhere ?? [])].slice(0, 3);
  const existingIds = new Set(existingPlaces.map((p) => p.name.toLowerCase()));
  const osm = (lookup.data?.results ?? []).filter((r) => !existingIds.has(r.name.toLowerCase())).slice(0, 6);
  const options: Option[] = [
    ...existingPlaces.map((place) => ({ kind: "existing" as const, key: `p${place.id}`, place })),
    ...osm.map((result, i) => ({ kind: "osm" as const, key: `o${i}-${result.lat},${result.lng}`, result })),
  ];
  const show = open && term.length >= 2;
  const searching = show && (lookup.isFetching || existing.isFetching) && options.length === 0;

  useEffect(() => setActive(-1), [debounced]);

  const choose = (o: Option) => {
    if (o.kind === "osm") {
      onPick(o.result);
      setOpen(false);
    }
  };

  let status = "";
  if (show) {
    if (searching) status = "Looking it up…";
    else if (options.length) status = `${options.length} suggestions. Use the arrow keys to choose.`;
    else if (lookup.isFetched) status = "No matches. Keep typing, or carry on and place the pin yourself.";
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={show && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && options[active] ? `${listId}-${options[active].key}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        maxLength={200}
        placeholder="Start typing, e.g. Ichiran Shibuya"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show || options.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            const o = options[active]!;
            if (o.kind === "existing") void navigate(`/?place=${o.place.id}`);
            else choose(o);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="field mt-1"
      />
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {show && (options.length > 0 || searching) ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="card absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto p-1 shadow-lg"
        >
          {searching ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted">
              Looking it up…
            </li>
          ) : null}
          {options.map((o, i) => {
            const isActive = i === active;
            const base = `flex w-full flex-col items-start rounded-xl px-3 py-2 text-left ${isActive ? "bg-stone-100" : "hover:bg-stone-100"}`;
            const firstOfGroup = i === 0 || options[i - 1]!.kind !== o.kind;
            return (
              <li key={o.key} role="presentation">
                {firstOfGroup ? (
                  <p role="presentation" className="px-3 pb-1 pt-2 text-xs font-extrabold uppercase tracking-wide text-muted">
                    {o.kind === "existing" ? "Already on the map" : "Found on the map"}
                  </p>
                ) : null}
                {o.kind === "existing" ? (
                  <Link
                    id={`${listId}-${o.key}`}
                    role="option"
                    aria-selected={isActive}
                    to={`/?place=${o.place.id}`}
                    className={base}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <span className="font-extrabold">{o.place.name}</span>
                    <span className="text-sm text-muted">
                      {o.place.subcategory.name} · It's already here, open it to rank or save
                    </span>
                  </Link>
                ) : (
                  <button
                    id={`${listId}-${o.key}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    className={base}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                  >
                    <span className="font-extrabold">
                      <span aria-hidden="true">📍 </span>
                      {o.result.name}
                    </span>
                    {o.result.address ? <span className="text-sm text-muted">{o.result.address}</span> : null}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
