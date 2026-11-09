import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { ApiError, type Schemas } from "../../api/client";
import { reverseGeocode, useCreatePlace, useSuggestLocation, type PlaceValues } from "../../hooks/places";
import { ADDED_MESSAGE, SENT_FOR_REVIEW_MESSAGE } from "../../lib/celebrate";
import { track } from "../../lib/track";
import { useCelebrate } from "../app/Celebration";
import CategoryPicker from "../map/CategoryPicker";
import { distanceMetres, formatDistance, mapApiErrors, type FormErrors, type LatLng } from "../map/geo";
import PlaceNameLookup, { type LookupPick } from "../map/PlaceNameLookup";
import PlaceNames from "../PlaceNames";

function without(errors: Record<string, string>, key: string): Record<string, string> {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

type Props = {
  /** The pin on the main map: null until a place is picked from the name search. */
  pin: LatLng | null;
  /** A suggestion was picked: pin it and move the map there. */
  onPinFromSearch: (p: LatLng) => void;
  /** Edit pin mode: dragging the pin or tapping the map moves it (handled by the map). */
  pinEditing: boolean;
  onEditPin: () => void;
  onDoneEditing: () => void;
  /** Where the map was when the panel opened, for nearby name suggestions. */
  near: LatLng | null;
  /** Picked a place that's already in the app: show it instead of adding a duplicate. */
  onPickExisting: (place: Schemas["PlaceSummary"]) => void;
  city: { slug: string; lat: number; lng: number } | null;
  initialName: string;
  /** "Add manually" from search (R13): saved pending admin review. */
  manual: boolean;
  onClose: () => void;
  /** Added: the map shows it with "Pin added". */
  onCreated: (placeId: number, name: string) => void;
};

/**
 * Add a place without leaving the map, search first (R13.12): type the name, pick it from the
 * list, and the map moves there and pins it. Only the category is left to choose.
 */
export default function AddPlacePanel({
  pin,
  onPinFromSearch,
  pinEditing,
  onEditPin,
  onDoneEditing,
  near,
  onPickExisting,
  city,
  initialName,
  manual,
  onClose,
  onCreated,
}: Props) {
  const uid = useId();
  const create = useCreatePlace();
  const celebrate = useCelebrate();
  const [name, setName] = useState(initialName.slice(0, 200));
  const [address, setAddress] = useState<string | null>(null);
  const [fromPick, setFromPick] = useState(false);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<FormErrors | null>(null);
  const [candidates, setCandidates] = useState<Schemas["PlaceSummary"][] | null>(null);
  const lastValues = useRef<PlaceValues | null>(null);

  // The area (location) comes from the pin; nobody has to pick it.
  const suggestion = useSuggestLocation(pin);
  const suggest = suggestion.data;
  const outside = suggest?.outside_coverage === true;
  const locationId = suggest?.location?.id ?? null;

  // Pin placed or moved by hand: look the address up quietly (a picked place brings its own).
  useEffect(() => {
    if (!pin || fromPick) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const a = await reverseGeocode(pin.lat, pin.lng);
      if (!cancelled) setAddress(a);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pin, fromPick]);

  // Any pin change drops stale duplicate candidates and the "pin" error.
  useEffect(() => {
    setCandidates(null);
    setErrors((e) => without(e, "pin"));
  }, [pin?.lat, pin?.lng]);

  const pick = (r: LookupPick) => {
    setName(r.name);
    setAddress(r.address);
    setFromPick(true);
    if (r.subcategory_id != null) setSubcategoryId(r.subcategory_id);
    setErrors({});
    onPinFromSearch({ lat: r.lat, lng: r.lng });
  };

  const send = (values: PlaceValues, confirm: boolean) => {
    lastValues.current = values;
    setServerErrors(null);
    create.mutate(
      { ...values, confirm_not_duplicate: confirm, source: manual ? "manual" : "pin", visited: false, review: null },
      {
        onSuccess: (res) => {
          if (res.status === "created" && res.place) {
            track("add", manual ? "manual" : "pin");
            celebrate(manual ? SENT_FOR_REVIEW_MESSAGE : ADDED_MESSAGE);
            onCreated(res.place.id, res.place.name);
          } else {
            setCandidates(res.candidates);
          }
        },
        onError: (err) => {
          setCandidates(null);
          const mapped = err instanceof ApiError ? mapApiErrors(err.body) : null;
          setServerErrors(mapped ?? { fields: {}, message: "Something went wrong. Please try again.", coveredCities: null });
          if (mapped) setErrors(mapped.fields);
        },
      },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Type the place's name.";
    if (!pin) next.pin = "Pick the place from the suggestions so we can pin it.";
    if (subcategoryId === null) next.subcategory_id = "Choose a category.";
    setErrors(next);
    if (Object.keys(next).length || !pin || subcategoryId === null) return;
    if (locationId === null) return; // still working out the area; the button shows it
    send(
      {
        name: name.trim(),
        name_ja: null,
        lat: pin.lat,
        lng: pin.lng,
        subcategory_id: subcategoryId,
        location_id: locationId,
        address: address?.trim() || null,
      },
      false,
    );
  };

  const waitingForArea = pin !== null && !outside && locationId === null;

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${uid}-title`} className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={`${uid}-title`} className="text-2xl font-extrabold">
            Add a place
          </h2>
          <p className="hint">
            {manual
              ? "We'll check it soon. Until then only you can see it."
              : "Search for it by name and pick it from the list."}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close add a place" className="btn btn-ghost btn-icon size-11 shrink-0 text-xl">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div>
        <label htmlFor={`${uid}-name`} className="label">
          Name <span aria-hidden="true">*</span>
        </label>
        <PlaceNameLookup
          inputId={`${uid}-name`}
          value={name}
          onChange={(v) => {
            setName(v);
            setErrors((e) => without(e, "name"));
          }}
          onPick={pick}
          onPickExisting={onPickExisting}
          onNoMatch={() => {
            setFromPick(false);
            onEditPin();
          }}
          autoFocus={!initialName}
          near={near ?? (city ? { lat: city.lat, lng: city.lng } : null)}
          city={city?.slug ?? "tokyo"}
          invalid={Boolean(errors.name)}
          describedBy={errors.name ? `${uid}-name-err` : undefined}
        />
        {errors.name ? (
          <p id={`${uid}-name-err`} role="alert" className="mt-1 text-sm text-danger">
            {errors.name}
          </p>
        ) : null}

        {/* Where it is: one line, set by the search; Edit pin only if it's off (R13.12). */}
        <div aria-live="polite" className="mt-2" data-testid="pin-readout">
          {pinEditing ? (
            <div className="flex flex-wrap items-center gap-2 rounded-(--radius-chunky) bg-brand-soft px-3 py-2 text-sm font-bold">
              <span className="flex-1">
                <span aria-hidden="true">✋ </span>Drag the pin, or tap the map where it is.
              </span>
              <button type="button" onClick={onDoneEditing} className="btn btn-primary btn-sm">
                Done
              </button>
            </div>
          ) : pin ? (
            <div className="flex flex-wrap items-center gap-2 rounded-(--radius-chunky) bg-success-soft px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-bold text-success-dark">
                <span aria-hidden="true">📍 </span>
                {address ?? "Pinned on the map"}
              </span>
              <button type="button" onClick={onEditPin} className="link text-sm">
                Edit pin
              </button>
            </div>
          ) : (
            <p className="hint">
              <span aria-hidden="true">🔎 </span>Pick it from the list and we'll pin it on the map. Not listed?{" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setFromPick(false);
                  onEditPin();
                }}
              >
                Place the pin yourself
              </button>
            </p>
          )}
          {errors.pin ? (
            <p role="alert" className="mt-1 text-sm text-danger">
              {errors.pin}
            </p>
          ) : null}
          {outside ? (
            <p role="alert" className="mt-1 text-sm font-bold text-warning-ink">
              That's outside the cities we cover for now ({(suggest?.covered_cities ?? []).map((c) => c.name).join(", ")}).
            </p>
          ) : null}
        </div>
      </div>

      <CategoryPicker
        value={subcategoryId}
        onChange={(v) => {
          setSubcategoryId(v);
          setErrors((e) => without(e, "subcategory_id"));
        }}
        error={errors.subcategory_id}
      />

      {candidates && lastValues.current ? (
        <section aria-labelledby={`${uid}-dup`} className="card border-amber-400 bg-warning-soft">
          <h3 id={`${uid}-dup`} className="font-extrabold text-amber-950">
            Is it one of these?
          </h3>
          <p className="text-sm text-amber-950">Similar places are already on the map nearby.</p>
          <ul className="mt-2 space-y-2">
            {candidates.map((c) => {
              const d = distanceMetres({ lat: lastValues.current!.lat, lng: lastValues.current!.lng }, { lat: c.lat, lng: c.lng });
              return (
                <li key={c.id} className="card p-3">
                  <PlaceNames name={c.name} nameJa={c.name_ja} as="span" />
                  <p className="hint">
                    {c.subcategory.name} · {formatDistance(d)} away
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm">
                    <button type="button" className="link" onClick={() => onPickExisting(c)}>
                      This is it: show it
                    </button>
                    <Link to={`/places/${c.id}/rank`} className="link">
                      Rank {c.name}
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
            onClick={() => lastValues.current && send(lastValues.current, true)}
          >
            This is different, add it anyway
          </button>
        </section>
      ) : null}

      {serverErrors?.message && !serverErrors.coveredCities ? (
        <p role="alert" className="card border-red-300 bg-red-50 text-sm text-danger">
          {serverErrors.message}
        </p>
      ) : null}

      <button type="submit" disabled={create.isPending || outside || waitingForArea} className="btn btn-primary w-full">
        {create.isPending ? "Adding…" : waitingForArea ? "Finding the area…" : manual ? "Send for review" : "Add place"}
      </button>
      <p className="text-center text-xs text-muted">
        Map data and addresses © OpenStreetMap contributors. What you add is shared under CC BY-SA 4.0.
      </p>
    </form>
  );
}
