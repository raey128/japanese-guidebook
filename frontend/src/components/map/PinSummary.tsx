import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { COPY } from "../../copy";
import { usePlace } from "../../hooks/places";
import { topCategoryInfo } from "../../lib/categories";
import { track } from "../../lib/track";
import { detectPlatform, directionsUrl, walkLabel } from "../../lib/walk";
import Badges from "../Badges";
import FlagButton from "../FlagButton";
import PlaceNames from "../PlaceNames";
import RankButton from "../RankButton";
import SaveButton from "../SaveButton";
import Score from "../Score";
import type { LatLng } from "./geo";

/**
 * The place popup (R6.2, R17.7), ordered for a decision in seconds: name → score → emoji · area ·
 * walk time → top note → Save ♡ · Directions · Rank → View details. Flag lives under "…".
 */
export default function PinSummary({
  placeId,
  onClose,
  userLoc = null,
  saveSource = "pin",
}: {
  placeId: number;
  onClose: () => void;
  userLoc?: LatLng | null;
  saveSource?: "pin" | "top_pick" | "search" | "list";
}) {
  const { data: place, isPending, isError } = usePlace(placeId);
  const ref = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    ref.current?.focus();
    setMoreOpen(false);
  }, [placeId]);

  const platform = detectPlatform(undefined, typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints);
  const info = place ? topCategoryInfo(place.subcategory.top_category) : undefined;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label="Place summary"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="card pointer-events-auto relative mx-auto w-full max-w-md shadow-xl"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close place summary"
        className="absolute right-2 top-2 rounded-xl px-2 py-1 text-xl text-muted hover:bg-stone-100"
      >
        <span aria-hidden="true">×</span>
      </button>
      {isPending && <p className="hint">{COPY.loading}</p>}
      {isError && <p role="alert">{COPY.loadError}</p>}
      {place && (
        <div className="space-y-2.5 pr-8">
          <PlaceNames name={place.name} nameJa={place.name_ja} as="h2" />
          <div className="flex flex-wrap items-center gap-2">
            <Score score={place.public_score} rankerCount={place.ranker_count} />
            <Badges badges={place.badges} />
          </div>
          <p className="text-sm font-bold text-muted">
            <span aria-hidden="true">{info?.emoji} </span>
            {place.subcategory.name} · {place.location.is_catch_all ? place.city.name : place.location.name}
            {userLoc ? ` · ${walkLabel(userLoc, place)}` : ""}
          </p>
          {place.top_note ? (
            <blockquote className="rounded-xl border-l-4 border-success bg-success-soft px-3 py-2 text-sm">
              <p className="line-clamp-2 font-semibold">“{place.top_note.note}”</p>
              <footer className="text-xs text-muted">— {place.top_note.author}</footer>
            </blockquote>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <SaveButton placeId={place.id} isSaved={place.viewer.is_bookmarked} source={saveSource} />
            <a
              href={directionsUrl(place, platform)}
              target={platform === "desktop" ? "_blank" : undefined}
              rel="noopener noreferrer"
              onClick={() => track("directions", platform)}
              className="btn btn-secondary btn-sm"
            >
              <span aria-hidden="true">🧭</span> {COPY.directions}
            </a>
            {place.status !== "rejected" ? <RankButton placeId={place.id} ranked={place.viewer.my_ranking !== null} /> : null}
            {place.viewer.can_flag ? (
              <div className="relative">
                <button
                  type="button"
                  aria-label="More actions"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                  className="btn btn-ghost btn-sm btn-icon"
                >
                  <span aria-hidden="true">…</span>
                </button>
                {moreOpen ? (
                  <div className="card absolute bottom-full right-0 z-20 mb-2 w-max p-2 shadow-lg">
                    <FlagButton place={place} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <Link to={`/places/${place.id}`} className="link inline-block text-sm">
            {COPY.viewDetails}
          </Link>
        </div>
      )}
    </div>
  );
}
