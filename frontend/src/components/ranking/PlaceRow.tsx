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
}: {
  place: Schemas["PlaceSummary"];
  rank?: number | null;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-stone-300 py-3">
      {rank !== undefined ? (
        <span className="w-8 text-right text-lg font-bold text-stone-800">
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
          <span className="text-sm text-stone-700">
            {place.subcategory.name} · {place.location.is_catch_all ? place.city.name : place.location.name}
          </span>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}
