import { useId } from "react";

export const NOTE_MAX = 1000;
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatVisit(month: number | null, year: number | null): string {
  if (!year && !month) return "";
  return [month ? MONTHS[month - 1] : null, year].filter(Boolean).join(" ");
}

export interface NoteValue {
  note: string;
  month: number | null;
  year: number | null;
}

type Props = {
  value: NoteValue;
  onChange: (v: NoteValue) => void;
  /** R3.6: low ratings need a comment. */
  required?: boolean;
  label?: string;
  error?: string;
};

export default function NoteFields({ value, onChange, required = false, label, error }: Props) {
  const id = useId();
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= thisYear - 30; y--) years.push(y);
  if (value.year && !years.includes(value.year)) years.push(value.year);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-note`} className="label">
          {label ?? (required ? "Comment" : "Comment (optional)")}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
        <textarea
          id={`${id}-note`}
          rows={4}
          maxLength={NOTE_MAX}
          value={value.note}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-note-err` : undefined}
          placeholder={required ? "What went wrong? Others will thank you." : "What should people order, see or know?"}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          className="field"
        />
        {error ? (
          <p id={`${id}-note-err`} role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="hint" aria-live="polite">
          {value.note.length} / {NOTE_MAX} characters
        </p>
      </div>
      <div className="flex gap-3">
        <div>
          <label htmlFor={`${id}-month`} className="label">
            Visit month
          </label>
          <select
            id={`${id}-month`}
            value={value.month ?? ""}
            onChange={(e) => onChange({ ...value, month: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 field"
          >
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-year`} className="label">
            Visit year
          </label>
          <select
            id={`${id}-year`}
            value={value.year ?? ""}
            onChange={(e) => onChange({ ...value, year: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 field"
          >
            <option value="">—</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
