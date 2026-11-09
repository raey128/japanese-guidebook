import type { Schemas } from "../../api/client";
import { COPY } from "../../copy";
import { topCategoryInfo } from "../../lib/categories";
import { walkLabel } from "../../lib/walk";
import type { LatLng } from "../map/geo";
import Button from "../ui/Button";
import Sheet from "../ui/Sheet";

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

function PeekCard({ place, userLoc, onPick }: { place: Place; userLoc: LatLng | null; onPick: () => void }) {
  const info = topCategoryInfo(place.subcategory.top_category);
  return (
    <button
      type="button"
      onClick={onPick}
      className="card flex w-44 shrink-0 flex-col items-start gap-0.5 p-2.5 text-left transition-transform active:translate-y-0.5 active:border-b-2"
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span aria-hidden="true" className="text-lg">
          {info?.emoji}
        </span>
        {place.public_score !== null && place.ranker_count > 0 ? (
          <span className="badge bg-success-soft text-success-dark">{place.public_score.toFixed(1)}</span>
        ) : (
          <span className="badge bg-warning-soft text-warning-ink">Team pick</span>
        )}
      </span>
      <span className="line-clamp-1 font-extrabold">{place.name}</span>
      <span className="line-clamp-1 text-xs text-muted">{userLoc ? walkLabel(userLoc, place) : place.subcategory.name}</span>
    </button>
  );
}

/** "Top picks here" (R15.2): best-ranked places in view, falling back to Team picks (R17.8). */
export default function TopPicksSheet({
  data,
  expanded,
  onExpandedChange,
  userLoc,
  onPick,
  onAddPlace,
}: {
  data: TopPicks | undefined;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  userLoc: LatLng | null;
  onPick: (place: Place) => void;
  onAddPlace: () => void;
}) {
  const items = data?.items ?? [];
  const team = data?.kind === "team";
  const nearby = data?.kind === "nearby";
  const title = team ? COPY.teamPicks : nearby ? COPY.nearbyPicks : COPY.topPicks;
  return (
    <Sheet
      label={title}
      title={
        <>
          <span>
            <span aria-hidden="true">{team ? "🧑‍🍳 " : nearby ? "🧭 " : "⭐ "}</span>
            {title}
          </span>
          <span className="badge bg-brand-soft text-brand-dark">{items.length}</span>
        </>
      }
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      peek={
        data === undefined ? (
          <p className="hint">Finding the best spots…</p>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold">{COPY.emptyRanked}</p>
            <Button size="sm" onClick={onAddPlace}>
              {COPY.addPlace}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {items.slice(0, 3).map((p) => (
              <PeekCard key={p.id} place={p} userLoc={userLoc} onPick={() => onPick(p)} />
            ))}
          </div>
        )
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span aria-hidden="true" className="text-4xl">
            🌱
          </span>
          <p className="font-extrabold">{COPY.emptyRanked}</p>
          <Button onClick={onAddPlace}>{COPY.addPlace}</Button>
        </div>
      ) : (
        <>
          {team ? <p className="hint pb-1">Nothing ranked here yet, so here are our team's favourites. Rank one to get things started!</p> : null}
          {nearby ? <p className="hint pb-1">Nothing ranked here yet, so here's what's around. Rank a place you've been to and Top picks will start to fill in!</p> : null}
          <ol aria-label={title}>
            {items.map((p, i) => (
              <PickRow key={p.id} place={p} rank={i + 1} userLoc={userLoc} onPick={() => onPick(p)} />
            ))}
          </ol>
        </>
      )}
    </Sheet>
  );
}
