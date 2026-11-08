import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";

import { ApiError } from "../api/client";
import { mapApiErrors, type FormErrors } from "../components/map/geo";
import PlaceForm from "../components/map/PlaceForm";
import { useMe } from "../hooks/auth";
import { usePlace, useUpdatePlace, type PlaceValues } from "../hooks/places";

export default function EditPlace() {
  const id = Number(useParams().id);
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const place = usePlace(Number.isFinite(id) ? id : null);
  const update = useUpdatePlace(id);
  const [errors, setErrors] = useState<FormErrors | null>(null);

  if (me.isPending || place.isPending) return <p>Loading…</p>;
  if (!me.data?.user) {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (place.isError || !place.data) return <p role="alert">Place not found.</p>;

  const p = place.data;
  if (!p.viewer.can_edit) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-bold">Editing is closed</h1>
        <p className="mt-2 text-ink">
          Only the person who added a place can edit it, and only for 24 hours after adding it.
        </p>
        <Link to={`/places/${p.id}`} className="mt-3 inline-block underline">
          Back to {p.name}
        </Link>
      </div>
    );
  }

  const deadline = p.edit_deadline ? new Date(p.edit_deadline) : null;

  const submit = (values: PlaceValues) => {
    setErrors(null);
    update.mutate(values, {
      onSuccess: () => void navigate(`/places/${p.id}`),
      onError: (err) =>
        setErrors(err instanceof ApiError ? mapApiErrors(err.body) : { fields: {}, message: "Something went wrong. Please try again.", coveredCities: null }),
    });
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-bold">Edit {p.name}</h1>
      {deadline && (
        <p className="mb-4 hint">
          You can edit this place until <time dateTime={p.edit_deadline ?? undefined}>{deadline.toLocaleString()}</time>.
        </p>
      )}
      <PlaceForm
        initial={{
          name: p.name,
          nameJa: p.name_ja ?? "",
          lat: p.lat,
          lng: p.lng,
          subcategoryId: p.subcategory.id,
          locationId: p.location.id,
          address: p.address ?? "",
        }}
        submitLabel="Save changes"
        pending={update.isPending}
        serverErrors={errors}
        onSubmit={submit}
      />
    </div>
  );
}
