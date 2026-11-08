import { useId } from "react";

import { useSubcategories } from "../../hooks/map";
import { groupByTopCategory } from "./geo";

export default function SubcategoryPicker({
  value,
  onChange,
  error,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  error?: string;
}) {
  const id = useId();
  const { data } = useSubcategories();
  const groups = groupByTopCategory(data ?? []);
  return (
    <div>
      <label htmlFor={id} className="label">
        Subcategory <span aria-hidden="true">*</span>
      </label>
      <select
        id={id}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="field mt-1"
      >
        <option value="">Choose a subcategory</option>
        {groups.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {g.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
