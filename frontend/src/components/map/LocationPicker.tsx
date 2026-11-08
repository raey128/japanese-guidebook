import { useId } from "react";

import type { Schemas } from "../../api/client";

export default function LocationPicker({
  city,
  locations,
  value,
  onChange,
  error,
  warning,
}: {
  city: Schemas["CityOut"] | null;
  locations: Schemas["LocationOut"][];
  value: number | null;
  onChange: (id: number | null) => void;
  error?: string;
  warning?: string | null;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        Location {city ? `in ${city.name}` : ""} <span aria-hidden="true">*</span>
      </label>
      <select
        id={id}
        required
        disabled={!city}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? `${id}-err` : "", warning ? `${id}-warn` : ""].filter(Boolean).join(" ") || undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="field mt-1 disabled:bg-stone-100"
      >
        <option value="">{city ? "Choose a location" : "Place the pin first"}</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {warning && (
        <p id={`${id}-warn`} role="alert" className="mt-1 text-sm text-amber-900">
          {warning}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
