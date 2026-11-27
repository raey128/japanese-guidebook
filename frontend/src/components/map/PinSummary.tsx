import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { COPY } from "../../copy";
import { usePlace } from "../../hooks/places";
import { usePlacePhotos } from "../../hooks/photos";
import { usePlaceNotes, type NoteSort } from "../../hooks/ranking";
import PhotoThumbs from "../photos/PhotoThumbs";
import { walkLabel } from "../../lib/walk";
import Badges from "../Badges";
import FlagButton from "../FlagButton";
import FlagNoteButton from "../FlagNoteButton";
import PlaceArt from "../ui/PlaceArt";
import MyRankingSummary from "../ranking/MyRankingSummary";
import WentPanel from "../ranking/WentPanel";
import { formatVisit } from "../ranking/NoteFields";
import { RatingBadge } from "../ranking/NumberRating";
import SaveButton from "../SaveButton";
import Score from "../Score";
import Chip from "../ui/Chip";
import type { LatLng } from "./geo";

const SORTS: { key: NoteSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "highest", label: "Top rated" },
  { key: "lowest", label: "Lowest" },
];

/** Everyone's photos of the place, newest first, as a strip on the card (R20.4). */
function PlacePhotoStrip({ placeId, signedIn }: { placeId: number; signedIn: boolean }) {
  const q = usePlacePhotos(placeId);
  const photos = q.data?.photos ?? [];
  if (photos.length === 0) return null;
  return <PhotoThumbs photos={photos} signedIn={signedIn} size="lg" label="Photos of this place" />;
}

/** Reviews in the place card, sortable (R17.9). */
function Reviews({ placeId, signedIn }: { placeId: number; signedIn: boolean }) {
  const [sort, setSort] = useState<NoteSort>("newest");
  const notes = usePlaceNotes(placeId, sort);
  const list = notes.data?.notes ?? [];
  // No reviews: no empty section taking up room (decided 2026-11-27).
  if (notes.data && list.length === 0) return null;
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
      <ul className="space-y-2">
        {list.map((n) => {
          const visit = formatVisit(n.visit_month, n.visit_year);
          return (
            <li key={n.ranking_id} className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <strong className="text-ink">{n.author}</strong>
                {n.rating ? <RatingBadge rating={n.rating} className="text-sm" /> : null}
                {visit ? <span>visited {visit}</span> : null}
                {signedIn && !n.is_own ? (
                  <span className="ml-auto">
                    <FlagNoteButton rankingId={n.ranking_id} />
                  </span>
                ) : null}
              </p>
              {n.note ? <p className="whitespace-pre-wrap text-sm">{n.note}</p> : null}
              {n.photos.length ? (
                <div className="mt-1.5">
                  <PhotoThumbs photos={n.photos} signedIn={signedIn} size="sm" label={`Photos by ${n.author}`} />
                </div>
              ) : null}
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
  const [photoSignal, setPhotoSignal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollTo({ top: 0 });
  }, [placeId]);

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
      {/* The photo is the hero (decided 2026-11-27): full width, nothing written over it. */}
      <div className="relative p-2 pb-0">
        {place ? (
          <div className="relative">
            {place.image ? (
              <img src={place.image.url} alt="" className="aspect-[4/3] w-full rounded-(--radius-card) bg-stone-200 object-cover" />
            ) : (
              <PlaceArt
                id={place.id}
                subcategorySlug={place.subcategory.slug}
                topCategory={place.subcategory.top_category}
                variant="tile"
                className="aspect-[2/1] w-full rounded-(--radius-card) text-6xl"
              />
            )}
            {canRate ? (
              <button
                type="button"
                onClick={() => setPhotoSignal((n) => n + 1)}
                className="absolute bottom-2 left-2 flex min-h-10 items-center gap-1.5 rounded-full bg-white/95 px-3 text-sm font-extrabold text-ink shadow-md hover:bg-white"
              >
                <span aria-hidden="true">📷</span> {place.image ? "Add photo" : "Add the first photo"}
              </button>
            ) : null}
            {place.image?.credit ? (
              <a
                href={place.image.credit_url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1 right-2 max-w-[50%] truncate text-[10px] font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]"
              >
                {place.image.credit} · Wikimedia
              </a>
            ) : null}
          </div>
        ) : (
          <div className="min-h-20 p-4">
            {isPending ? <p className="hint">{COPY.loading}</p> : null}
            {isError ? <p role="alert">{COPY.loadError}</p> : null}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close place summary"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur hover:bg-black/60"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {place && v ? (
        <div className="space-y-3 px-4 pb-4 pt-2">
          <div>
            <h2 className="font-display text-2xl font-black leading-tight">{place.name}</h2>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-bold text-muted">
              {place.name_ja ? <span lang="ja">{place.name_ja} ·</span> : null}
              <span>
                {place.subcategory.name} · {place.location.is_catch_all ? place.city.name : place.location.name}
              </span>
              {userLoc ? <span>· {walkLabel(userLoc, place)}</span> : null}
              {place.public_score !== null ? <Score score={place.public_score} rankerCount={place.ranker_count} /> : null}
              <Badges badges={place.badges} />
            </p>
            {place.address ? <p className="truncate text-xs text-muted">{place.address}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRate ? (
              <WentPanel
                key={place.id}
                placeId={place.id}
                placeName={place.name}
                current={v.my_ranking?.rating ?? null}
                rankingId={v.my_ranking?.id ?? null}
                photoCount={v.my_ranking?.photos?.length ?? 0}
                openSignal={photoSignal}
                canRate
              />
            ) : (
              <p className="flex-1 text-sm font-bold text-muted">Reported closed</p>
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

          <PlacePhotoStrip placeId={place.id} signedIn={v.signed_in} />

          {v.my_ranking ? <MyRankingSummary ranking={v.my_ranking} /> : null}

          <Reviews placeId={place.id} signedIn={v.signed_in} />
        </div>
      ) : null}
    </div>
  );
}
