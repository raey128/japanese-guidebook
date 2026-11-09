import type { Schemas } from "../../api/client";
import { COPY } from "../../copy";
import { topCategoryInfo } from "../../lib/categories";
import { walkLabel } from "../../lib/walk";
import type { LatLng } from "../map/geo";
import Button from "../ui/Button";

type Place = Schemas["PlaceSummary"];
type TopPicks = Schemas["TopPicks"];

function PickRow({ place, rank, userLoc, onPick }: { place: Place; rank: number; userLoc: LatLng | null; onPick: () => void }) {
  const info = topCategoryInfo(place.subcategory.top_category);
  return (
    <li>
      <button type="button" onClick={onPick} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-stone-50">
        <span className="w-6 text-right text-lg font-extrabold text-brand">{rank}</span>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: info?.color }}>
          {info?.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{place.name}</span>
          <span className="block truncate text-xs text-muted">
            {place.subcategory.name} · {place.location.is_catch_all ? place.city.name : place.location.name}
            {userLoc ? ` · ${walkLabel(userLoc, place)}` : ""}
          </span>
        </span>
        {place.public_score !== null && place.ranker_count > 0 ? (
          <span className="badge bg-success-soft text-sm text-success-dark">{place.public_score.toFixed(1)}</span>
        ) : null}
      </button>
    </li>
  );
}

const OPEN_KEY = "jg.picksOpen";

/** Remembered per browser; closed by default so the map stays clear (R15.6). */
export function loadPicksOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePicksOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage blocked: it just won't be remembered.
  }
}

/**
 * "Top picks here" (R15.2) as a side panel you can hide (R15.6): a small tab on the left edge
 * opens it; ‹ closes it. Falls back to Team picks (R17.8), then to places in view.
 */
export default function TopPicksPanel({
  data,
  open,
  onOpenChange,
  userLoc,
  onPick,
  onAddPlace,
}: {
  data: TopPicks | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userLoc: LatLng | null;
  onPick: (place: Place) => void;
  onAddPlace: () => void;
}) {
  const items = data?.items ?? [];
  const team = data?.kind === "team";
  const nearby = data?.kind === "nearby";
  const title = team ? COPY.teamPicks : nearby ? COPY.nearbyPicks : COPY.topPicks;
  const emoji = team ? "🧑‍🍳" : nearby ? "🧭" : "⭐";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-expanded={false}
        aria-controls="top-picks-panel"
        className="pointer-events-auto flex items-center gap-1.5 rounded-r-(--radius-chunky) border-2 border-l-0 border-b-4 border-line bg-white py-2 pl-2 pr-3 font-extrabold shadow-lg"
      >
        <span aria-hidden="true">{emoji}</span>
        <span>{title}</span>
        {items.length ? <span className="badge bg-brand-soft text-brand-dark">{items.length}</span> : null}
        <span aria-hidden="true" className="text-muted">›</span>
      </button>
    );
  }

  return (
    <section
      id="top-picks-panel"
      aria-label={title}
      className="pointer-events-auto flex max-h-full w-80 max-w-[85vw] flex-col rounded-r-(--radius-card) border-2 border-l-0 border-b-4 border-line bg-white shadow-xl"
    >
      <div className="flex items-center gap-2 border-b-2 border-line px-3 py-2">
        <h2 className="flex-1 text-base font-extrabold">
          <span aria-hidden="true">{emoji} </span>
          {title}
        </h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-expanded={true}
          aria-controls="top-picks-panel"
          aria-label={`Hide ${title}`}
          className="btn btn-ghost btn-sm btn-icon size-9 text-lg"
        >
          <span aria-hidden="true">‹</span>
        </button>
      </div>
      <div className="overflow-y-auto overscroll-contain px-2 py-1">
        {data === undefined ? <p className="hint p-2">Finding the best spots…</p> : null}
        {data && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span aria-hidden="true" className="text-4xl">
              🌱
            </span>
            <p className="font-extrabold">{COPY.emptyRanked}</p>
            <Button size="sm" onClick={onAddPlace}>
              {COPY.addPlace}
            </Button>
          </div>
        ) : null}
        {team ? <p className="hint px-1 pb-1">Nothing rated here yet, so here are our team's favourites.</p> : null}
        {nearby ? <p className="hint px-1 pb-1">Nothing rated here yet, so here's what's around. Rate a place to start Top picks!</p> : null}
        {items.length > 0 ? (
          <ol aria-label={title}>
            {items.map((p, i) => (
              <PickRow key={p.id} place={p} rank={i + 1} userLoc={userLoc} onPick={() => onPick(p)} />
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
