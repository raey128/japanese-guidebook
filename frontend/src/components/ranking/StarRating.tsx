import { useId } from "react";

import { RATING_LABELS, starsText } from "../../lib/rating";

type Props = {
  value: number | null;
  onChange: (rating: number) => void;
  label?: string;
  error?: string;
  autoFocus?: boolean;
};

/**
 * 1–5 star picker (R3.6). Native radio buttons underneath, so arrow keys, screen readers and
 * form semantics work; the stars are just their labels.
 */
export default function StarRating({ value, onChange, label = "Your rating", error, autoFocus }: Props) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined} aria-invalid={error ? true : undefined}>
      <legend className="label">
        {label} <span aria-hidden="true">*</span>
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value !== null && n <= value;
          return (
            <label key={n} className="cursor-pointer" title={RATING_LABELS[n]}>
              <input
                type="radio"
                name={`${id}-stars`}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                autoFocus={autoFocus && n === (value ?? 1)}
                className="peer sr-only"
                aria-label={`${n} ${n === 1 ? "star" : "stars"}: ${RATING_LABELS[n]}`}
              />
              <span
                aria-hidden="true"
                className={`block select-none rounded-lg px-0.5 text-4xl leading-none transition-transform peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stays active:scale-90 motion-reduce:transition-none ${
                  on ? "text-amber-600" : "text-line-strong"
                }`}
              >
                ★
              </span>
            </label>
          );
        })}
        <span className="ml-2 min-w-20 font-extrabold text-ink" aria-hidden="true">
          {value ? RATING_LABELS[value] : ""}
        </span>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Read-only stars, e.g. next to a note. */
export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} className={`text-amber-600 ${className}`}>
      {starsText(rating)}
    </span>
  );
}
