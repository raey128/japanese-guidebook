import type { ReactNode } from "react";
import { Link } from "react-router";

import Badges from "../Badges";
import PlaceNames from "../PlaceNames";
import Score from "../Score";
import type { Schemas } from "../../api/client";

/** One place in a list: optional rank number, names (linked to detail), score, badges. */
export default function PlaceRow({
  place,
  rank,
  actions,
  showOnMap = false,
}: {
  place: Schemas["PlaceSummary"];
  rank?: number | null;
  actions?: ReactNode;
  showOnMap?: boolean;
}) {
  const allActions =
    actions || showOnMap ? (
      <>
        {showOnMap ? <ShowOnMapLink placeId={place.id} name={place.name} /> : null}
        {actions}
      </>
    ) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-line py-3">
      {rank !== undefined ? (
        <span className="w-8 text-right text-lg font-extrabold text-brand">
          <span aria-hidden="true">{rank ?? "—"}</span>
          <span className="sr-only">{rank ? `Rank ${rank}` : "Not ranked"}</span>
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <Link to={`/places/${place.id}`} className="underline-offset-2 hover:underline">
          <PlaceNames name={place.name} nameJa={place.name_ja} as="span" />
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Score score={place.public_score} rankerCount={place.ranker_count} />
          <Badges badges={place.badges} />
          <span className="hint">
            {place.subcategory.name} · {place.location.is_catch_all ? place.city.name : place.location.name}
          </span>
        </div>
      </div>
      {allActions ? <div className="flex flex-wrap gap-2">{allActions}</div> : null}
    </li>
  );
}

/** Opens the map centred on a place with its pin summary open (R14.5). */
export function ShowOnMapLink({ placeId, name }: { placeId: number; name: string }) {
  return (
    <Link to={`/?place=${placeId}`} className="btn btn-secondary btn-sm">
      Show on map<span className="sr-only"> {name}</span>
    </Link>
  );
}
