import { useRef, type ReactNode } from "react";

/**
 * Bottom sheet with a peek and an expanded state (used by Top picks, R15.2). Controlled: the parent owns
 * `expanded`. The handle is a real button (keyboard + screen readers); a vertical drag on it also toggles.
 */
export default function Sheet({
  title,
  label,
  expanded,
  onExpandedChange,
  peek,
  children,
  className = "",
}: {
  title: ReactNode;
  /** Accessible name for the sheet region (required when `title` isn't plain text). */
  label?: string;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  peek?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const startY = useRef<number | null>(null);
  return (
    <section
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
      className={`pointer-events-auto rounded-t-[22px] border-2 border-b-0 border-line bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.12)] ${className}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        onPointerDown={(e) => {
          startY.current = e.clientY;
        }}
        onPointerUp={(e) => {
          if (startY.current === null) return;
          const dy = e.clientY - startY.current;
          startY.current = null;
          if (Math.abs(dy) > 30) {
            e.preventDefault();
            onExpandedChange(dy < 0);
          }
        }}
        className="flex w-full flex-col items-center gap-1 px-4 pb-2 pt-2 text-left"
      >
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" />
        <span className="flex w-full items-center justify-between gap-2 text-base font-extrabold">{title}</span>
      </button>
      {!expanded && peek ? <div className="px-4 pb-3">{peek}</div> : null}
      {expanded ? <div className="max-h-[55dvh] overflow-y-auto px-4 pb-4">{children}</div> : null}
    </section>
  );
}
