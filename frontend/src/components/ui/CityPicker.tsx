import { useEffect, useId, useRef, useState } from "react";
import { PinIcon } from "./MapPin";

type City = { id: number; slug: string; name: string; name_ja?: string | null };

type Props = {
  cities: City[];
  value: string;
  onChange: (slug: string) => void;
  /** "pill" sits inside the map search bar; "title" is a big heading-style picker (Lists). */
  variant?: "pill" | "title";
  label?: string;
};

/**
 * A city dropdown styled like the rest of the app (R16.2) instead of the browser's own select:
 * a button that opens a card list. Arrow keys, Enter and Escape work; it closes on outside click.
 */
export default function CityPicker({ cities, value, onChange, variant = "pill", label = "City" }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = cities.find((c) => c.slug === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, cities.findIndex((c) => c.slug === value)));
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, cities, value]);

  const choose = (slug: string) => {
    onChange(slug);
    setOpen(false);
    button.current?.focus();
  };

  const buttonClass =
    variant === "title"
      ? "inline-flex items-center gap-2 rounded-(--radius-chunky) px-2 py-1 text-3xl font-extrabold hover:bg-stone-100"
      : "inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-brand-soft px-3 text-sm font-extrabold text-brand-dark hover:brightness-95";

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${current?.name ?? "choose"}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(cities.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const c = cities[active];
            if (c) choose(c.slug);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={buttonClass}
      >
        {variant === "title" ? <PinIcon size={26} /> : null}
        <span>{current?.name ?? "City"}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} fill="currentColor">
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          className="card absolute left-0 top-full z-40 mt-2 min-w-48 p-1.5 shadow-xl"
        >
          {cities.map((c, i) => {
            const selected = c.slug === value;
            return (
              <li
                key={c.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={selected}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(c.slug)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 font-extrabold ${
                  i === active ? "bg-brand-soft" : ""
                } ${selected ? "text-brand-dark" : "text-ink"}`}
              >
                <span>
                  {c.name}
                  {c.name_ja ? (
                    <span lang="ja" className="ml-2 text-sm font-bold text-muted">
                      {c.name_ja}
                    </span>
                  ) : null}
                </span>
                {selected ? <span aria-hidden="true">✓</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
