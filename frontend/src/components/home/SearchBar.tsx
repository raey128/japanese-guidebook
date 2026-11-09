import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Schemas } from "../../api/client";
import { COPY } from "../../copy";
import { useSuggest } from "../../hooks/map";
import { topCategoryInfo } from "../../lib/categories";
import { track } from "../../lib/track";
import type { Bbox } from "../map/geo";
import CityPicker from "../ui/CityPicker";
import { PinIcon } from "../ui/MapPin";

type City = Schemas["CityWithLocations"];
type Loc = Schemas["LocationOut"];
type Sub = Schemas["SubcategoryOut"];
type Place = Schemas["PlaceSummary"];

export type Option =
  | { kind: "area"; loc: Loc }
  | { kind: "sub"; sub: Sub }
  | { kind: "place"; place: Place; group: "on_map" | "elsewhere" }
  | { kind: "add"; text: string };

/** Debounce a value (150 ms by default, R12.1). */
function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The floating search bar (R11.3, R12): [City ▾][Where to?]. Focusing the empty input lists the
 * city's areas (the area picker, R11.4); typing shows grouped suggestions. Follows the ARIA
 * combobox pattern (N3.4): ↑/↓ move, Enter picks, Esc closes.
 */
export default function SearchBar({
  cities,
  city,
  onCity,
  category,
  bbox,
  initialQuery = "",
  onPickArea,
  onPickSubcategory,
  onPickPlace,
  onAddManually,
  onOpenChange,
}: {
  cities: City[];
  city: string;
  onCity: (slug: string) => void;
  category: string;
  bbox: Bbox | null;
  initialQuery?: string;
  onPickArea: (loc: Loc) => void;
  onPickSubcategory: (sub: Sub) => void;
  onPickPlace: (place: Place) => void;
  onAddManually: (text: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [text, setText] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = useDebounced(text.trim());
  const cityData = cities.find((c) => c.slug === city);
  const suggest = useSuggest(term, city, category, bbox);
  const typed = text.trim();

  const groups = useMemo(() => {
    const out: { label: string; options: Option[] }[] = [];
    if (!typed) {
      const areas = (cityData?.locations ?? []).filter((l) => !l.is_catch_all);
      const catchAll = (cityData?.locations ?? []).filter((l) => l.is_catch_all);
      out.push({ label: `Areas in ${cityData?.name ?? "this city"}`, options: [...areas, ...catchAll].map((loc) => ({ kind: "area", loc })) });
      return out;
    }
    const d = term === typed ? suggest.data : undefined;
    if (d) {
      if (d.areas.length) out.push({ label: "Areas", options: d.areas.map((loc) => ({ kind: "area", loc })) });
      if (d.subcategories.length) out.push({ label: "Categories", options: d.subcategories.map((sub) => ({ kind: "sub", sub })) });
      if (d.on_map.length) out.push({ label: "On the map", options: d.on_map.map((place) => ({ kind: "place", place, group: "on_map" })) });
      if (d.elsewhere.length)
        out.push({
          label: `Elsewhere in ${cityData?.name ?? "the city"}`,
          options: d.elsewhere.map((place) => ({ kind: "place", place, group: "elsewhere" })),
        });
    }
    // "Add manually" is always the last row once something is typed (R12.5).
    out.push({ label: "Can't find it?", options: [{ kind: "add", text: typed }] });
    return out;
  }, [typed, term, suggest.data, cityData]);

  const flat = groups.flatMap((g) => g.options);
  const placeCount = flat.filter((o) => o.kind !== "add").length;

  // R18.1: count searches that found nothing at all (once per term).
  const lastNoResult = useRef("");
  useEffect(() => {
    const d = suggest.data;
    if (!d || term.length < 2 || term !== typed || lastNoResult.current === term) return;
    if (!d.areas.length && !d.subcategories.length && !d.on_map.length && !d.elsewhere.length) {
      lastNoResult.current = term;
      track("search_no_result");
    }
  }, [suggest.data, term, typed]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => setActive(-1), [typed]);

  function pick(o: Option) {
    setOpen(false);
    inputRef.current?.blur();
    if (o.kind === "area") {
      setText("");
      onPickArea(o.loc);
    } else if (o.kind === "sub") {
      setText("");
      onPickSubcategory(o.sub);
    } else if (o.kind === "place") {
      setText(o.place.name);
      track("place_open", "search");
      onPickPlace(o.place);
    } else onAddManually(o.text);
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let index = -1;

  return (
    <div className="relative">
      {/* Same height as the ⚙️ menu button beside it (h-14), city · divider · search. */}
      <div className="card flex h-14 items-center gap-2 py-0 pl-1.5 pr-3 shadow-lg">
        <CityPicker cities={cities} value={city} onChange={onCity} />
        <span aria-hidden="true" className="h-7 w-0.5 shrink-0 rounded-full bg-line" />
        <span aria-hidden="true" className="text-lg">
          🔎
        </span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search places and areas"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          placeholder={COPY.searchPlaceholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(flat.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              const o = flat[active >= 0 ? active : 0];
              if (open && o) {
                e.preventDefault();
                pick(o);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-10 min-w-0 flex-1 bg-transparent text-base font-bold placeholder:font-semibold placeholder:text-muted focus:outline-none"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {open && typed ? `${placeCount} suggestions` : ""}
      </p>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="card absolute inset-x-0 top-full z-30 mt-2 max-h-[60dvh] overflow-y-auto p-2 shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label} className="py-1">
              <p aria-hidden="true" className="px-2 pb-1 text-xs font-extrabold uppercase tracking-wide text-muted">
                {g.label}
              </p>
              {g.options.map((o) => {
                index++;
                const i = index;
                return (
                  <div
                    key={optionKey(o)}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active === i}
                    onClick={() => pick(o)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 ${active === i ? "bg-brand-soft" : ""}`}
                  >
                    <OptionBody option={o} />
                  </div>
                );
              })}
            </div>
          ))}
          {typed && suggest.isFetching && !suggest.data ? <p className="px-2 py-1 hint">Searching…</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function optionKey(o: Option): string {
  if (o.kind === "area") return `a${o.loc.id}`;
  if (o.kind === "sub") return `s${o.sub.id}`;
  if (o.kind === "place") return `p${o.place.id}`;
  return "add";
}

function OptionBody({ option: o }: { option: Option }) {
  if (o.kind === "area")
    return (
      <>
        <PinIcon />
        <span className="font-bold">{o.loc.name}</span>
        {o.loc.name_ja ? (
          <span lang="ja" className="hint">
            {o.loc.name_ja}
          </span>
        ) : null}
      </>
    );
  if (o.kind === "sub") {
    const info = topCategoryInfo(o.sub.top_category);
    return (
      <>
        <span aria-hidden="true">{info?.emoji}</span>
        <span className="font-bold">{o.sub.name}</span>
        <span className="hint">{info?.name}</span>
      </>
    );
  }
  if (o.kind === "place") {
    const info = topCategoryInfo(o.place.subcategory.top_category);
    return (
      <>
        <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: info?.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{o.place.name}</span>
          <span className="block truncate text-xs text-muted">
            {o.place.subcategory.name} · {o.place.location.is_catch_all ? o.place.city.name : o.place.location.name}
            {o.place.badges.includes("pending") ? " · Pending review" : ""}
          </span>
        </span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true">➕</span>
      <span className="font-bold text-stays">
        Can't find it? Add “{o.text}” manually
      </span>
    </>
  );
}
