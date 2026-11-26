import { useId } from "react";

import { RATING_ENDS, RATING_MAX, ratingWord } from "../../lib/rating";

type Props = {
  value: number | null;
  onChange: (rating: number) => void;
  label?: string;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
};

/** Colour for a rating: warm for high, neutral middle, muted low (also used by RatingBadge). */
function tone(n: number): string {
  if (n >= 8) return "border-success-dark bg-success text-white";
  if (n >= 5) return "border-warning-ink bg-warning-soft text-warning-ink";
  return "border-ink bg-ink text-white";
}

/**
 * Rate 1 to 10 (R3.6): ten round chunky buttons (two rows of five on a phone) with "skip it" and
 * "must go" at the ends. Native radio buttons underneath, so arrow keys and screen readers work.
 */
export default function NumberRating({ value, onChange, label = "Your rating", error, autoFocus, disabled }: Props) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : `${id}-ends`} aria-invalid={error ? true : undefined} disabled={disabled}>
      <legend className="label">
        {label} <span aria-hidden="true">*</span>
      </legend>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          return (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name={`${id}-rating`}
                value={n}
                checked={on}
                onChange={() => onChange(n)}
                autoFocus={autoFocus && n === (value ?? 1)}
                className="peer sr-only"
                aria-label={`${n} out of ${RATING_MAX}: ${ratingWord(n)}`}
              />
              <span
                aria-hidden="true"
                className={`flex aspect-square w-full select-none items-center justify-center rounded-full border-2 border-b-4 text-lg font-extrabold transition-transform active:translate-y-0.5 active:border-b-2 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stays motion-reduce:transition-none ${
                  on ? tone(n) : "border-line-strong bg-white text-ink hover:bg-stone-50"
                }`}
              >
                {n}
              </span>
            </label>
          );
        })}
      </div>
      <p id={`${id}-ends`} className="mt-1 flex justify-between text-xs font-bold text-muted">
        <span>1 · {RATING_ENDS.low}</span>
        <span>10 · {RATING_ENDS.high}</span>
      </p>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** A rating shown as a small chunky badge, e.g. "8/10". */
export function RatingBadge({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Rated ${rating} out of ${RATING_MAX}`}
      className={`inline-flex items-center rounded-full border-2 px-2 text-sm font-extrabold leading-5 ${tone(rating)} ${className}`}
    >
      {rating}
      <span className="text-[0.7em] opacity-80">/{RATING_MAX}</span>
    </span>
  );
}
