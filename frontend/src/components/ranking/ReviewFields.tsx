import { needsComment } from "../../lib/rating";
import NoteFields, { type NoteValue } from "./NoteFields";
import NumberRating from "./NumberRating";

export type ReviewValue = NoteValue & { rating: number | null };
export const EMPTY_REVIEW: ReviewValue = { rating: null, note: "", month: null, year: null };

type Props = {
  value: ReviewValue;
  onChange: (v: ReviewValue) => void;
  errors?: { rating?: string; note?: string };
};

/** A 1-10 rating (required) plus comment (required at 4 or lower) and visit date (R3.6). */
export default function ReviewFields({ value, onChange, errors }: Props) {
  const required = needsComment(value.rating);
  return (
    <div className="space-y-3">
      <NumberRating value={value.rating} onChange={(rating) => onChange({ ...value, rating })} error={errors?.rating} />
      {required ? (
        <p className="hint" aria-live="polite">
          Sorry it wasn't great! A short comment helps others know why.
        </p>
      ) : null}
      <NoteFields
        value={value}
        onChange={(v) => onChange({ ...value, ...v })}
        required={required}
        error={errors?.note}
      />
    </div>
  );
}
