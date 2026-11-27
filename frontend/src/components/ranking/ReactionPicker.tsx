import { useId } from "react";

import { REACTIONS, type Reaction } from "../../lib/reactions";
import { tiltFor } from "../../lib/placeArt";

/**
 * Been there in one tap (decided 2026-11-27): five chunky, slightly tilted reaction stickers.
 * Native radio buttons underneath for keyboards and screen readers.
 */
export default function ReactionPicker({
  value,
  onChange,
  label = "How was it?",
  disabled,
}: {
  value: Reaction["key"] | null;
  onChange: (r: Reaction) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="label">{label}</legend>
      <div className="grid grid-cols-5 gap-2">
        {REACTIONS.map((r) => {
          const on = value === r.key;
          return (
            <label key={r.key} className="cursor-pointer">
              <input
                type="radio"
                name={`${id}-reaction`}
                value={r.key}
                checked={on}
                onChange={() => onChange(r)}
                className="peer sr-only"
              />
              <span
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 border-b-4 px-1 py-2 text-center text-xs font-extrabold leading-tight transition-transform active:translate-y-0.5 active:border-b-2 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stays motion-reduce:transition-none ${
                  on ? "scale-105 text-white shadow-lg" : "border-line-strong bg-white text-ink hover:bg-stone-50"
                }`}
                style={on ? { background: r.bg, borderColor: r.border, transform: `rotate(${tiltFor(r.key) / 2}deg) scale(1.05)` } : undefined}
              >
                <span aria-hidden="true" className="text-3xl leading-none">
                  {r.emoji}
                </span>
                {r.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
