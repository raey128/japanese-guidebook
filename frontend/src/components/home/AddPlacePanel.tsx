import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { ApiError, type Schemas } from "../../api/client";
import { useCreatePlace, type PlaceValues } from "../../hooks/places";
import { ADDED_MESSAGE, rankingMessage, SENT_FOR_REVIEW_MESSAGE } from "../../lib/celebrate";
import { reviewProblem } from "../../lib/rating";
import { track } from "../../lib/track";
import { useCelebrate } from "../app/Celebration";
import { distanceMetres, formatDistance, mapApiErrors, type FormErrors, type LatLng } from "../map/geo";
import PlaceForm from "../map/PlaceForm";
import PlaceNames from "../PlaceNames";
import ReviewFields, { EMPTY_REVIEW, type ReviewValue } from "../ranking/ReviewFields";

type Props = {
  /** The pin on the main map; moving it (drag, tap, suggestion, address) always goes through onPinChange. */
  pin: LatLng | null;
  onPinChange: (p: LatLng) => void;
  /** City slug and centre, for name suggestions. */
  city: { slug: string; lat: number; lng: number } | null;
  initialName: string;
  /** "Add manually" from search (R13): saved pending admin review. */
  manual: boolean;
  onClose: () => void;
  /** Added (and no comparisons to make): the map shows it. */
  onCreated: (placeId: number) => void;
};

/**
 * Add a place without leaving the map (R13.7): this panel sits over the map, and the single
 * draggable pin lives on the map itself.
 */
export default function AddPlacePanel({ pin, onPinChange, city, initialName, manual, onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const create = useCreatePlace();
  const lastValues = useRef<PlaceValues | null>(null);
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [candidates, setCandidates] = useState<Schemas["PlaceSummary"][] | null>(null);
  const celebrate = useCelebrate();
  const uid = useId();
  // R3.6: "Have you been here?" must be answered; if yes, a star rating is required.
  const [visited, setVisited] = useState<boolean | null>(null);
  const [review, setReview] = useState<ReviewValue>(EMPTY_REVIEW);
  const [reviewErrors, setReviewErrors] = useState<{ visited?: string; rating?: string; note?: string }>({});
  const [initial] = useState(() => (initialName ? { name: initialName.slice(0, 200) } : {}));

  const validateReview = () => {
    const errs: typeof reviewErrors = {};
    if (visited === null) errs.visited = "Let us know if you've been here.";
    else if (visited) Object.assign(errs, reviewProblem(review.rating, review.note) ?? {});
    setReviewErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const reviewSection = (
    <section aria-labelledby={`${uid}-been`} className="space-y-3">
      <h2 id={`${uid}-been`} className="font-semibold">
        4. Have you been here? <span aria-hidden="true">*</span>
      </h2>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-been`}
        aria-describedby={reviewErrors.visited ? `${uid}-been-err` : undefined}
        className="grid grid-cols-2 gap-2"
      >
        {[
          { v: true, label: "Yes, I've been", emoji: "🙌" },
          { v: false, label: "Not yet", emoji: "👀" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={visited === o.v}
            onClick={() => {
              setVisited(o.v);
              setReviewErrors({});
            }}
            className={`btn ${visited === o.v ? "btn-primary" : "btn-secondary"}`}
          >
            <span aria-hidden="true">{o.emoji}</span> {o.label}
          </button>
        ))}
      </div>
      {reviewErrors.visited ? (
        <p id={`${uid}-been-err`} role="alert" className="text-sm text-danger">
          {reviewErrors.visited}
        </p>
      ) : null}
      {visited ? (
        <div className="card space-y-3">
          <p className="hint">Rate it to add it to your rankings. A comment is optional, unless it's below 3 stars.</p>
          <ReviewFields
            value={review}
            onChange={(v) => {
              setReview(v);
              setReviewErrors({});
            }}
            errors={reviewErrors}
          />
        </div>
      ) : null}
    </section>
  );

  const submit = (values: PlaceValues, confirm: boolean) => {
    lastValues.current = values;
    setErrors(null);
    const withReview = visited === true && review.rating !== null;
    create.mutate(
      {
        ...values,
        confirm_not_duplicate: confirm,
        source: manual ? "manual" : "pin",
        visited: withReview,
        review: withReview
          ? { rating: review.rating!, note: review.note.trim() || null, visit_month: review.month, visit_year: review.year }
          : null,
      },
      {
        onSuccess: (res) => {
          if (res.status === "created" && res.place) {
            track("add", manual ? "manual" : "pin");
            const id = res.place.id;
            if (res.ranking) {
              track("rank", "new");
              const msg = res.city_rank_count > 0 ? rankingMessage(res.city_rank_count, res.city_name) : null;
              celebrate(msg?.title ?? (manual ? SENT_FOR_REVIEW_MESSAGE : ADDED_MESSAGE), { big: msg?.big });
              // Others in the same list: a few quick "which was better?" taps put it in exactly the right spot.
              if (res.compare_count > 0) {
                void navigate(`/places/${id}/rank?refine=1`);
                return;
              }
            } else {
              celebrate(manual ? SENT_FOR_REVIEW_MESSAGE : ADDED_MESSAGE);
            }
            onCreated(id);
          } else {
            setCandidates(res.candidates);
          }
        },
        onError: (err) => {
          setCandidates(null);
          setErrors(err instanceof ApiError ? mapApiErrors(err.body) : { fields: {}, message: "Something went wrong. Please try again.", coveredCities: null });
        },
      },
    );
  };

  return (
    <section aria-labelledby={`${uid}-title`} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={`${uid}-title`} className="text-2xl font-extrabold">
            Add a place
          </h2>
          <p className="hint">
            {manual
              ? "We'll check it soon. Until then only you can see it, and you can already rank or save it."
              : "Type its name and we'll pin it, or drag the pin on the map."}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close add a place" className="btn btn-ghost btn-icon size-11 shrink-0 text-xl">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <PlaceForm
        initial={initial}
        pin={pin}
        onPinChange={onPinChange}
        lookup={{ city: city?.slug ?? "tokyo", near: city ? { lat: city.lat, lng: city.lng } : null }}
        validateExtra={validateReview}
        extraFields={reviewSection}
        submitLabel={manual ? "Send for review" : "Add place"}
        pending={create.isPending}
        serverErrors={errors}
        onSubmit={(v) => submit(v, false)}
        onEdited={() => setCandidates(null)}
      >
        {candidates && lastValues.current && (
          <section aria-labelledby="dup-heading" className="card border-amber-400 bg-warning-soft">
            <h2 id="dup-heading" className="font-semibold text-amber-950">
              Is it one of these?
            </h2>
            <p className="text-sm text-amber-950">Similar places already exist nearby. Pick one instead of adding a duplicate.</p>
            <ul className="mt-2 space-y-2">
              {candidates.map((c) => {
                const d = distanceMetres({ lat: lastValues.current!.lat, lng: lastValues.current!.lng }, { lat: c.lat, lng: c.lng });
                return (
                  <li key={c.id} className="card p-3">
                    <PlaceNames name={c.name} nameJa={c.name_ja} as="h3" />
                    <p className="hint">
                      {c.subcategory.name} · {formatDistance(d)} away
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      <Link to={`/places/${c.id}/rank`} className="font-medium text-brand underline">
                        This is it: rank {c.name}
                      </Link>
                      <Link to={`/places/${c.id}`} className="link">
                        View details
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-3"
              disabled={create.isPending}
              onClick={() => lastValues.current && submit(lastValues.current, true)}
            >
              This is different, add it anyway
            </button>
          </section>
        )}
      </PlaceForm>
    </section>
  );
}
