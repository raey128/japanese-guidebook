import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { useCities } from "../../hooks/map";
import { reverseGeocode, useSuggestLocation, type PlaceValues } from "../../hooks/places";
import LicenceNotice from "../LicenceNotice";
import AddressSearch from "./AddressSearch";
import BasePinMap from "./BasePinMap";
import { type FormErrors, type LatLng } from "./geo";
import LocationPicker from "./LocationPicker";
import PlaceNameLookup, { type LookupPick } from "./PlaceNameLookup";
import SubcategoryPicker from "./SubcategoryPicker";

export type PlaceFormInitial = {
  name: string;
  nameJa: string;
  lat: number | null;
  lng: number | null;
  subcategoryId: number | null;
  locationId: number | null;
  address: string;
};

type Props = {
  initial?: Partial<PlaceFormInitial>;
  submitLabel: string;
  pending: boolean;
  serverErrors: FormErrors | null;
  onSubmit: (v: PlaceValues) => void;
  /** Extra content shown just above the submit button (duplicate candidates). */
  children?: ReactNode;
  /** Called when the user changes anything, so the parent can drop stale duplicate candidates. */
  onEdited?: () => void;
  /** Add mode (R13.6): the name field suggests businesses and fills in address and pin. */
  lookup?: { city: string; near: LatLng | null };
  /** Extra fields after the details (the "have you been?" review). */
  extraFields?: ReactNode;
  /** Validates the extra fields on submit; return false to stop. */
  validateExtra?: () => boolean;
  /**
   * Pin owned by the parent (Add a place on the main map): the form shows no map of its own,
   * and every way of moving the pin (suggestion, address, my location, drag/tap on the big
   * map) goes through `onPinChange`.
   */
  pin?: LatLng | null;
  onPinChange?: (p: LatLng) => void;
};

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-danger">
      {text}
    </p>
  );
}

export default function PlaceForm({
  initial,
  submitLabel,
  pending,
  serverErrors,
  onSubmit,
  children,
  onEdited,
  lookup,
  extraFields,
  validateExtra,
  pin: outerPin,
  onPinChange,
}: Props) {
  const uid = useId();
  const hasInitialPin = initial?.lat != null && initial?.lng != null;
  const [name, setName] = useState(initial?.name ?? "");
  const [nameJa, setNameJa] = useState(initial?.nameJa ?? "");
  const [subcategoryId, setSubcategoryId] = useState<number | null>(initial?.subcategoryId ?? null);
  const [locationId, setLocationId] = useState<number | null>(initial?.locationId ?? null);
  const [locationTouched, setLocationTouched] = useState(initial?.locationId != null);
  const controlled = outerPin !== undefined;
  const [innerPin, setInnerPin] = useState<LatLng | null>(hasInitialPin ? { lat: initial!.lat!, lng: initial!.lng! } : null);
  const pin = controlled ? outerPin : innerPin;
  const [address, setAddress] = useState(initial?.address ?? "");
  const [addressTouched, setAddressTouched] = useState(Boolean(initial?.address));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cityWarning, setCityWarning] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const skipFirstGeocode = useRef(hasInitialPin && Boolean(initial?.address));

  const touch = () => onEdited?.();
  const clearError = (k: string) => setErrors((e) => (k in e ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)) : e));

  useEffect(() => {
    if (serverErrors) setErrors(serverErrors.fields);
  }, [serverErrors]);

  const cities = useCities();
  const suggestion = useSuggestLocation(pin);
  const suggest = suggestion.data;
  const outside = suggest?.outside_coverage === true || (serverErrors?.coveredCities != null && !suggest);
  const coveredCities = suggest?.covered_cities ?? serverErrors?.coveredCities ?? [];

  const city = suggest?.city ?? null;
  const cityLocations = useMemo(
    () => (city ? (cities.data?.find((c) => c.id === city.id)?.locations ?? []) : []),
    [city, cities.data],
  );

  // Pre-select the suggested location until the user picks one; if the pin moves to another city, force a re-pick.
  useEffect(() => {
    if (!suggest || suggest.outside_coverage || !suggest.location || !suggest.city) return;
    if (!locationTouched) {
      if (locationId !== suggest.location.id) setLocationId(suggest.location.id);
      return;
    }
    if (locationId !== null) {
      const current = cities.data?.flatMap((c) => c.locations).find((l) => l.id === locationId);
      if (current && current.city_id !== suggest.city.id) {
        setLocationId(null);
        setCityWarning(`The pin is now in ${suggest.city.name}. Please choose a location there.`);
      }
    }
  }, [suggest, cities.data, locationId, locationTouched]);

  // Reverse-geocode shortly after the pin settles; failure leaves the address untouched.
  useEffect(() => {
    if (!pin) return;
    if (skipFirstGeocode.current) {
      skipFirstGeocode.current = false;
      return;
    }
    if (addressTouched) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const a = await reverseGeocode(pin.lat, pin.lng);
      if (!cancelled && a) setAddress(a);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pin, addressTouched]);

  /** The one way the pin moves, whatever moved it. */
  const setPinFromUser = (p: LatLng) => {
    const rounded = { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) };
    if (controlled) onPinChange?.(rounded);
    else setInnerPin(rounded);
  };
  // However the pin moved (here or by dragging it on the big map): clear its error, drop stale duplicates.
  const firstPin = useRef(true);
  useEffect(() => {
    if (firstPin.current) {
      firstPin.current = false;
      return;
    }
    clearError("pin");
    touch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.lat, pin?.lng]);

  // Picked a business from the name suggestions: fill in what we know and drop the pin there.
  const pickBusiness = (r: LookupPick) => {
    setName(r.name);
    clearError("name");
    if (r.address) {
      setAddress(r.address);
      setAddressTouched(true);
    }
    if (r.subcategory_id != null && subcategoryId === null) {
      setSubcategoryId(r.subcategory_id);
      clearError("subcategory_id");
    }
    setPinFromUser({ lat: r.lat, lng: r.lng });
    setPicked(r.address ? `Pinned at ${r.address}.` : `Pinned ${r.name} on the map.`);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoMsg("Your browser can't share its location. Search for an address or tap the map.");
      return;
    }
    setGeoMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoMsg("Pin set to your location.");
        setPinFromUser({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setGeoMsg("Couldn't get your location. Search for an address or tap the map."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "English name is required.";
    if (subcategoryId === null) next.subcategory_id = "Choose a subcategory.";
    if (locationId === null) next.location_id = "Choose a location.";
    if (!pin) next.pin = "Place the pin on the map.";
    setErrors(next);
    const extraOk = validateExtra ? validateExtra() : true;
    if (Object.keys(next).length || !extraOk || !pin || subcategoryId === null || locationId === null) return;
    onSubmit({
      name: name.trim(),
      name_ja: nameJa.trim() || null,
      lat: pin.lat,
      lng: pin.lng,
      subcategory_id: subcategoryId,
      location_id: locationId,
      address: address.trim() || null,
    });
  };

  const input = "field mt-1";
  const canSubmit = pin !== null && !outside && !pending;

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={submitLabel}>
      <section aria-labelledby={`${uid}-what`} className="space-y-3">
        <h2 id={`${uid}-what`} className="font-semibold">
          1. What's it called?
        </h2>
        <div>
          <label htmlFor={`${uid}-name`} className="label">
            English name <span aria-hidden="true">*</span>
          </label>
          {lookup ? (
            <PlaceNameLookup
              inputId={`${uid}-name`}
              value={name}
              onChange={(v) => {
                setName(v);
                setPicked(null);
                clearError("name");
                touch();
              }}
              onPick={pickBusiness}
              near={pin ?? lookup.near}
              city={lookup.city}
              invalid={Boolean(errors.name)}
              describedBy={errors.name ? `${uid}-name-err` : `${uid}-name-hint`}
            />
          ) : (
            <input
              id={`${uid}-name`}
              value={name}
              maxLength={200}
              required
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${uid}-name-err` : undefined}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
                touch();
              }}
              className={input}
            />
          )}
          {lookup ? (
            <p id={`${uid}-name-hint`} className="mt-1 text-xs text-muted">
              Pick a suggestion and we'll fill in the address and pin it for you.
            </p>
          ) : null}
          <FieldError id={`${uid}-name-err`} text={errors.name} />
        </div>
        <div>
          <label htmlFor={`${uid}-ja`} className="label">
            Japanese name (optional)
          </label>
          <input
            id={`${uid}-ja`}
            lang="ja"
            value={nameJa}
            maxLength={200}
            aria-describedby={errors.name_ja ? `${uid}-ja-err` : undefined}
            onChange={(e) => {
              setNameJa(e.target.value);
              clearError("name_ja");
              touch();
            }}
            className={input}
          />
          <FieldError id={`${uid}-ja-err`} text={errors.name_ja} />
        </div>
        {picked ? (
          <p role="status" className="card border-success bg-success-soft p-3 text-sm font-bold text-success-dark">
            <span aria-hidden="true">📍 </span>
            {picked} {controlled ? "Drag the pin on the map" : "Drag the pin below"} if it's not quite right.
          </p>
        ) : null}
      </section>

      <section aria-labelledby={`${uid}-pin`} className="space-y-2">
        <h2 id={`${uid}-pin`} className="font-semibold">
          2. Where is it?
        </h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={useMyLocation} className="btn btn-secondary btn-sm">
            Use my location
          </button>
        </div>
        <p aria-live="polite" className="hint">
          {geoMsg}
        </p>
        <AddressSearch onPick={(p, label) => {
          setPinFromUser(p);
          if (!addressTouched) setAddress(label);
        }} />
        {controlled ? (
          <p className="card bg-brand-soft p-3 text-sm font-bold" data-testid="pin-readout">
            <span aria-hidden="true">📍 </span>
            {pin
              ? "Drag the red pin on the map, or tap the map where the place is."
              : "Tap the map where the place is."}
          </p>
        ) : (
          <BasePinMap lat={pin?.lat ?? null} lng={pin?.lng ?? null} draggable clickToSet onChange={setPinFromUser} height={300} label="Place pin map" />
        )}
        <FieldError id={`${uid}-pin-err`} text={errors.pin} />
        {outside && (
          <div role="alert" className="card border-amber-400 bg-warning-soft text-sm text-warning-ink">
            <p className="font-semibold">We only cover these cities for now</p>
            <ul className="list-disc pl-5">
              {coveredCities.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby={`${uid}-details`} className="space-y-3">
        <h2 id={`${uid}-details`} className="font-semibold">
          3. Details
        </h2>
        <SubcategoryPicker
          value={subcategoryId}
          onChange={(v) => {
            setSubcategoryId(v);
            clearError("subcategory_id");
            touch();
          }}
          error={errors.subcategory_id}
        />
        <LocationPicker
          city={city}
          locations={cityLocations}
          value={locationId}
          warning={cityWarning}
          error={errors.location_id}
          onChange={(v) => {
            setLocationId(v);
            setLocationTouched(true);
            setCityWarning(null);
            clearError("location_id");
            touch();
          }}
        />
        <div>
          <label htmlFor={`${uid}-addr`} className="label">
            Address (optional)
          </label>
          <input
            id={`${uid}-addr`}
            value={address}
            maxLength={500}
            onChange={(e) => {
              setAddress(e.target.value);
              setAddressTouched(true);
            }}
            className={input}
          />
          <p className="mt-1 text-xs text-muted">Filled in automatically from the pin when possible.</p>
        </div>
      </section>

      {extraFields}
      <LicenceNotice />
      {children}
      {serverErrors?.message && !serverErrors.coveredCities && (
        <p role="alert" className="card border-red-300 bg-red-50 text-sm text-danger">
          {serverErrors.message}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="btn btn-primary"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {!pin && <p className="hint">Place the pin to enable this button.</p>}
    </form>
  );
}
