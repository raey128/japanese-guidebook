import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { usePlace } from "../../hooks/places";
import Badges from "../Badges";
import FlagButton from "../FlagButton";
import PlaceNames from "../PlaceNames";
import RankButton from "../RankButton";
import Score from "../Score";
import WantToGoButton from "../WantToGoButton";

export default function PinSummary({ placeId, onClose }: { placeId: number; onClose: () => void }) {
  const { data: place, isPending, isError } = usePlace(placeId);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [placeId]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label="Place summary"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="absolute inset-x-2 bottom-2 z-10 mx-auto max-w-md rounded-lg border border-stone-300 bg-white p-3 shadow-lg"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close place summary"
        className="absolute right-2 top-2 rounded px-2 py-1 text-stone-800 hover:bg-stone-100"
      >
        <span aria-hidden="true">×</span>
      </button>
      {isPending && <p>Loading…</p>}
      {isError && <p role="alert">Couldn't load this place.</p>}
      {place && (
        <div className="space-y-2 pr-8">
          <PlaceNames name={place.name} nameJa={place.name_ja} as="h2" />
          <p className="text-sm text-stone-700">
            {place.subcategory.name} · {place.location.name}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Score score={place.public_score} rankerCount={place.ranker_count} />
            <Badges badges={place.badges} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RankButton placeId={place.id} ranked={place.viewer.my_ranking !== null} />
            <WantToGoButton placeId={place.id} isBookmarked={place.viewer.is_bookmarked} />
            {place.viewer.can_flag && <FlagButton place={place} />}
          </div>
          <Link to={`/places/${place.id}`} className="inline-block text-sm font-medium text-brand underline">
            View details
          </Link>
        </div>
      )}
    </div>
  );
}
