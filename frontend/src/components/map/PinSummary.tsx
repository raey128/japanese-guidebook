import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { COPY } from "../../copy";
import { usePlace } from "../../hooks/places";
import { usePlaceNotes, type NoteSort } from "../../hooks/ranking";
import { topCategoryInfo } from "../../lib/categories";
import { walkLabel } from "../../lib/walk";
import Badges from "../Badges";
import FlagButton from "../FlagButton";
import FlagNoteButton from "../FlagNoteButton";
import PlaceNames from "../PlaceNames";
import RankButton from "../RankButton";
import MyRankingSummary from "../ranking/MyRankingSummary";
import { formatVisit } from "../ranking/NoteFields";
import { Stars } from "../ranking/StarRating";
import SaveButton from "../SaveButton";
import Score from "../Score";
import Chip from "../ui/Chip";
import type { LatLng } from "./geo";
import { PinIcon } from "../ui/MapPin";

const SORTS: { key: NoteSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "highest", label: "Top rated" },
  { key: "lowest", label: "Lowest" },
];

/** Reviews in the place card, sortable (R17.9). */
function Reviews({ placeId, signedIn }: { placeId: number; signedIn: boolean }) {
  const [sort, setSort] = useState<NoteSort>("newest");
  const notes = usePlaceNotes(placeId, sort);
  const list = notes.data?.notes ?? [];
  return (
    <section aria-labelledby={`reviews-${placeId}`} className="space-y-2 border-t-2 border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`reviews-${placeId}`} className="text-base font-extrabold">
          Reviews{notes.data ? ` (${list.length})` : ""}
        </h3>
        {list.length > 1 ? (
          <div role="group" aria-label="Sort reviews" className="flex gap-1">
            {SORTS.map((s) => (
              <Chip key={s.key} pressed={sort === s.key} onClick={() => setSort(s.key)} className="min-h-8 px-2.5 py-0.5 text-xs">
                {s.label}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
      {notes.isPending ? <p className="hint">Loading reviews…</p> : null}
      {notes.data && list.length === 0 ? <p className="hint">No reviews yet. Rate it and be the first!</p> : null}
      <ul className="space-y-2">
        {list.map((n) => {
          const visit = formatVisit(n.visit_month, n.visit_year);
          return (
            <li key={n.ranking_id} className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <strong className="text-ink">{n.author}</strong>
                {n.rating ? <Stars rating={n.rating} className="text-sm" /> : null}
                {visit ? <span>visited {visit}</span> : null}
                {signedIn && !n.is_own ? (
                  <span className="ml-auto">
                    <FlagNoteButton rankingId={n.ranking_id} />
                  </span>
                ) : null}
              </p>
              <p className="whitespace-pre-wrap text-sm">{n.note}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The place card on the map (R6.2, R17.7): everything about a place in one scrollable card, so
 * nothing opens a new page. Rate is the main action; save (bookmark) and flag are icons.
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
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollTo({ top: 0 });
  }, [placeId]);

  const info = place ? topCategoryInfo(place.subcategory.top_category) : undefined;
  const v = place?.viewer;
  const ranked = v?.my_ranking != null;
  const canRate = place && place.status !== "rejected" && (ranked || !v?.signed_in || v.can_rank);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label="Place summary"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="card pointer-events-auto relative mx-auto w-full max-w-md overflow-y-auto overscroll-contain p-0 shadow-xl"
      style={{ maxHeight: "62vh" }}
    >
      <div className="sticky top-0 z-10 flex items-start gap-2 border-b-2 border-line bg-white px-4 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          {place ? <PlaceNames name={place.name} nameJa={place.name_ja} as="h2" /> : null}
          {isPending ? <p className="hint">{COPY.loading}</p> : null}
          {isError ? <p role="alert">{COPY.loadError}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close place summary"
          className="rounded-xl px-2 py-1 text-xl text-muted hover:bg-stone-100"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {place && v ? (
        <div className="space-y-3 px-4 pb-4 pt-3">
          <div className="flex items-center gap-2">
            {canRate ? (
              <RankButton placeId={place.id} ranked={ranked} className="flex-1 min-h-11 text-base" />
            ) : (
              <p className="flex-1 text-sm font-bold text-muted">Reported closed: not taking new ratings</p>
            )}
            <SaveButton placeId={place.id} isSaved={v.is_bookmarked} source={saveSource} icon />
            {v.can_flag ? <FlagButton place={place} icon /> : null}
            {v.can_edit ? (
              <Link
                to={`/places/${place.id}/edit`}
                aria-label="Edit place"
                title="Edit place"
                className="btn btn-ghost btn-sm btn-icon size-10 text-lg"
              >
                <span aria-hidden="true">✏️</span>
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Score score={place.public_score} rankerCount={place.ranker_count} />
            <Badges badges={place.badges} />
          </div>
          <p className="text-sm font-bold text-muted">
            <span aria-hidden="true">{info?.emoji} </span>
            {place.subcategory.name} · {place.location.is_catch_all ? place.city.name : place.location.name}
            {userLoc ? ` · ${walkLabel(userLoc, place)}` : ""}
          </p>
          {place.address ? (
            <p className="text-sm">
              <PinIcon className="mr-1" />
              {place.address}
            </p>
          ) : null}
          <p className="text-xs text-muted">Added by {place.creator}</p>

          {v.my_ranking ? <MyRankingSummary ranking={v.my_ranking} /> : null}

          <Reviews placeId={place.id} signedIn={v.signed_in} />
        </div>
      ) : null}
    </div>
  );
}
