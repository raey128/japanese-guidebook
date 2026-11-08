import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";

import { ApiError, type Schemas } from "../api/client";
import { distanceMetres, formatDistance, mapApiErrors, type FormErrors } from "../components/map/geo";
import PlaceForm from "../components/map/PlaceForm";
import PlaceNames from "../components/PlaceNames";
import { useCelebrate } from "../components/app/Celebration";
import { useMe } from "../hooks/auth";
import { ADDED_MESSAGE, SENT_FOR_REVIEW_MESSAGE } from "../lib/celebrate";
import { track } from "../lib/track";
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
  const celebrate = useCelebrate();
  // "Add manually" from search (R13): pre-filled name, saved pending admin review.
  const manual = params.get("source") === "manual";

  const initial = useMemo(() => {
    const lat = parseCoord(params.get("lat"), 90);
    const lng = parseCoord(params.get("lng"), 180);
    const name = (params.get("name") ?? "").slice(0, 200);
    return { ...(lat !== null && lng !== null ? { lat, lng } : {}), ...(name ? { name } : {}) };
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
      { ...values, confirm_not_duplicate: confirm, source: manual ? "manual" : "pin" },
      {
        onSuccess: (res) => {
          if (res.status === "created" && res.place) {
            track("add", manual ? "manual" : "pin");
            celebrate(manual ? SENT_FOR_REVIEW_MESSAGE : ADDED_MESSAGE);
            void navigate(manual ? `/?place=${res.place.id}` : `/places/${res.place.id}`);
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
      <h1 className="mb-1 text-3xl font-extrabold">Add a place</h1>
      <p className="mb-4 hint">
        {manual
          ? "Put the pin where it is and we'll check it soon. Until then, only you can see it (and you can already rank or save it)."
          : "Drop a pin where the place is. It appears straight away, marked Unverified."}
      </p>
      <PlaceForm
        initial={initial}
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
    </div>
  );
}
