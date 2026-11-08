import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";

import { ApiError, type Schemas } from "../api/client";
import { distanceMetres, formatDistance, mapApiErrors, type FormErrors } from "../components/map/geo";
import PlaceForm from "../components/map/PlaceForm";
import PlaceNames from "../components/PlaceNames";
import { useMe } from "../hooks/auth";
import { useCreatePlace, type PlaceValues } from "../hooks/places";

function parseCoord(v: string | null, max: number): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

export default function AddPlace() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const create = useCreatePlace();
  const lastValues = useRef<PlaceValues | null>(null);
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [candidates, setCandidates] = useState<Schemas["PlaceSummary"][] | null>(null);

  const initial = useMemo(() => {
    const lat = parseCoord(params.get("lat"), 90);
    const lng = parseCoord(params.get("lng"), 180);
    return lat !== null && lng !== null ? { lat, lng } : {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me.isPending) return <p>Loading…</p>;
  if (!me.data?.user) {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  const submit = (values: PlaceValues, confirm: boolean) => {
    lastValues.current = values;
    setErrors(null);
    create.mutate(
      { ...values, confirm_not_duplicate: confirm },
      {
        onSuccess: (res) => {
          if (res.status === "created" && res.place) {
            void navigate(`/places/${res.place.id}`);
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
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-bold">Add a place</h1>
      <p className="mb-4 text-sm text-stone-700">
        Drop a pin where the place is. It appears straight away, marked Unverified.
      </p>
      <PlaceForm
        initial={initial}
        submitLabel="Add place"
        pending={create.isPending}
        serverErrors={errors}
        onSubmit={(v) => submit(v, false)}
        onEdited={() => setCandidates(null)}
      >
        {candidates && lastValues.current && (
          <section aria-labelledby="dup-heading" className="rounded border border-amber-600 bg-amber-50 p-3">
            <h2 id="dup-heading" className="font-semibold text-amber-950">
              Is it one of these?
            </h2>
            <p className="text-sm text-amber-950">Similar places already exist nearby. Pick one instead of adding a duplicate.</p>
            <ul className="mt-2 space-y-2">
              {candidates.map((c) => {
                const d = distanceMetres({ lat: lastValues.current!.lat, lng: lastValues.current!.lng }, { lat: c.lat, lng: c.lng });
                return (
                  <li key={c.id} className="rounded border border-stone-300 bg-white p-2">
                    <PlaceNames name={c.name} nameJa={c.name_ja} as="h3" />
                    <p className="text-sm text-stone-700">
                      {c.subcategory.name} · {formatDistance(d)} away
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      <Link to={`/places/${c.id}/rank`} className="font-medium text-brand underline">
                        This is it: rank {c.name}
                      </Link>
                      <Link to={`/places/${c.id}`} className="underline">
                        View details
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="mt-3 rounded border border-stone-700 bg-white px-3 py-1.5 text-sm font-medium"
              disabled={create.isPending}
              onClick={() => lastValues.current && submit(lastValues.current, true)}
            >
              This is different, add it anyway
            </button>
          </section>
        )}
      </PlaceForm>
    </div>
  );
}
