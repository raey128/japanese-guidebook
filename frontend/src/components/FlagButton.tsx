import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "../api/client";
import { useCities, useFlagPlace, useSubcategories } from "../hooks/moderation";
import Dialog from "./moderation/Dialog";
import { flagErrorMessage } from "./moderation/errors";
import { buildFlagBody, type FlagType } from "./moderation/flagBody";
import PinMap from "./PinMap";
import { FlagIcon } from "./ui/icons";

type Place = Schemas["PlaceSummary"];

const CHOICES: { value: FlagType; label: string }[] = [
  { value: "closed", label: "Closed" },
  { value: "wrong_location", label: "Wrong location" },
  { value: "wrong_info", label: "Wrong info" },
  { value: "duplicate", label: "Duplicate" },
  { value: "spam", label: "Fake or spam" },
];

const input = "field";
const TOP_LABEL: Record<string, string> = {
  food: "Food",
  sights: "Sights",
  stays: "Stays",
  experiences: "Experiences",
};

export default function FlagButton({ place, icon = false }: { place: Place; icon?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {icon ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Flag"
          title="Report a problem with this place"
          className="btn btn-ghost btn-sm btn-icon size-10 text-muted"
        >
          <FlagIcon />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">
          Flag
        </button>
      )}
      {open && <FlagDialog place={place} onClose={() => setOpen(false)} />}
    </>
  );
}

function FlagDialog({ place, onClose }: { place: Place; onClose: () => void }) {
  const [type, setType] = useState<FlagType | null>(null);
  const [lat, setLat] = useState(String(place.lat));
  const [lng, setLng] = useState(String(place.lng));
  const [name, setName] = useState(place.name);
  const [nameJa, setNameJa] = useState(place.name_ja ?? "");
  const [subcategoryId, setSubcategoryId] = useState(String(place.subcategory.id));
  const [locationId, setLocationId] = useState(String(place.location.id));
  const [duplicateId, setDuplicateId] = useState<number | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useFlagPlace(place.id);
  const done = mutation.data;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildFlagBody(place, { type, lat, lng, name, nameJa, subcategoryId, locationId, duplicateId });
    if ("error" in built) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    mutation.mutate(built.body);
  }

  if (done) {
    return (
      <Dialog title="Flag this place" onClose={onClose}>
        <p role="status" className="mb-2">
          Thanks — an admin will review it.
        </p>
        {done.auto_action && (
          <p role="status" className="mb-2 text-ink">
            Enough people have flagged this place that it was automatically{" "}
            {done.auto_action === "hidden" ? "hidden" : "marked as closed"} pending review.
          </p>
        )}
        <button type="button" onClick={onClose} className="btn btn-primary">
          Close
        </button>
      </Dialog>
    );
  }

  const error = formError ?? (mutation.error ? flagErrorMessage(mutation.error) : null);

  return (
    <Dialog title={`Flag ${place.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <fieldset className="mb-3">
          <legend className="mb-1 font-medium">What is wrong?</legend>
          {CHOICES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 py-1.5">
              <input
                type="radio"
                name="flag_type"
                value={c.value}
                checked={type === c.value}
                onChange={() => {
                  setType(c.value);
                  setFormError(null);
                  mutation.reset();
                }}
              />
              {c.label}
            </label>
          ))}
        </fieldset>

        {type === "wrong_location" && (
          <div className="mb-3 space-y-2">
            <p className="hint">Drag the pin to where the place really is, or type the coordinates.</p>
            <PinMap
              lat={Number.isFinite(Number(lat)) && lat !== "" ? Number(lat) : place.lat}
              lng={Number.isFinite(Number(lng)) && lng !== "" ? Number(lng) : place.lng}
              draggable
              height={220}
              onChange={(p) => {
                setLat(p.lat.toFixed(6));
                setLng(p.lng.toFixed(6));
              }}
            />
            <div className="flex gap-2">
              <label className="flex-1 text-sm">
                Latitude
                <input className={input} type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => setLat(e.target.value)} />
              </label>
              <label className="flex-1 text-sm">
                Longitude
                <input className={input} type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => setLng(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {type === "wrong_info" && (
          <WrongInfoFields
            place={place}
            name={name}
            nameJa={nameJa}
            subcategoryId={subcategoryId}
            locationId={locationId}
            setName={setName}
            setNameJa={setNameJa}
            setSubcategoryId={setSubcategoryId}
            setLocationId={setLocationId}
          />
        )}

        {type === "duplicate" && (
          <DuplicatePicker
            place={place}
            selectedId={duplicateId}
            selectedName={duplicateName}
            onPick={(id, n) => {
              setDuplicateId(id);
              setDuplicateName(n);
            }}
          />
        )}

        <div aria-live="polite">
          {error && (
            <p role="alert" className="mb-3 text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn btn-primary disabled:opacity-60"
          >
            {mutation.isPending ? "Sending…" : "Submit flag"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function WrongInfoFields(props: {
  place: Place;
  name: string;
  nameJa: string;
  subcategoryId: string;
  locationId: string;
  setName: (v: string) => void;
  setNameJa: (v: string) => void;
  setSubcategoryId: (v: string) => void;
  setLocationId: (v: string) => void;
}) {
  const subs = useSubcategories();
  const cities = useCities();
  const locations = cities.data?.find((c) => c.slug === props.place.city.slug)?.locations ?? [];
  const groups = new Map<string, Schemas["SubcategoryOut"][]>();
  for (const s of subs.data ?? []) groups.set(s.top_category, [...(groups.get(s.top_category) ?? []), s]);

  return (
    <div className="mb-3 space-y-2">
      <p className="hint">Change only what is wrong.</p>
      <label className="block text-sm">
        Suggested name
        <input className={input} value={props.name} maxLength={200} onChange={(e) => props.setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        Suggested Japanese name
        <input className={input} lang="ja" value={props.nameJa} maxLength={200} onChange={(e) => props.setNameJa(e.target.value)} />
      </label>
      <label className="block text-sm">
        Suggested subcategory
        <select className={input} value={props.subcategoryId} onChange={(e) => props.setSubcategoryId(e.target.value)}>
          {[...groups.entries()].map(([top, items]) => (
            <optgroup key={top} label={TOP_LABEL[top] ?? top}>
              {items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
          {!subs.data && <option value={props.subcategoryId}>{props.place.subcategory.name}</option>}
        </select>
      </label>
      <label className="block text-sm">
        Suggested location
        <select className={input} value={props.locationId} onChange={(e) => props.setLocationId(e.target.value)}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          {locations.length === 0 && <option value={props.locationId}>{props.place.location.name}</option>}
        </select>
      </label>
    </div>
  );
}

function DuplicatePicker({
  place,
  selectedId,
  selectedName,
  onPick,
}: {
  place: Place;
  selectedId: number | null;
  selectedName: string;
  onPick: (id: number, name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ["search", "flag-duplicate", debounced, place.city.slug],
    enabled: debounced.length > 0,
    queryFn: async () =>
      unwrap(await api.GET("/api/search", { params: { query: { q: debounced, city: place.city.slug } } })),
  });
  const items = (results.data?.items ?? []).filter((i) => i.id !== place.id);

  return (
    <div className="mb-3 space-y-2">
      <label className="block text-sm">
        Search for the other place
        <input className={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div aria-live="polite" className="hint">
        {selectedId !== null && <p>Selected: {selectedName}</p>}
        {results.isFetching && <p>Searching…</p>}
        {debounced && !results.isFetching && items.length === 0 && <p>No matches.</p>}
      </div>
      <ul className="max-h-48 divide-y-2 divide-line overflow-y-auto rounded-(--radius-chunky) border-2 border-line">
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              aria-pressed={selectedId === i.id}
              onClick={() => onPick(i.id, i.name)}
              className={`block w-full px-2 py-2 text-left hover:bg-stone-100 ${selectedId === i.id ? "bg-stone-200" : ""}`}
            >
              {i.name}
              {i.name_ja && <span lang="ja"> {i.name_ja}</span>}
              <span className="block hint">
                {i.subcategory.name} · {i.location.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
