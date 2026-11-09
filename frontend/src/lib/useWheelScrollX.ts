import { useCallback, useRef } from "react";

function onWheel(this: HTMLElement, e: WheelEvent) {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already sideways (trackpad)
  const max = this.scrollWidth - this.clientWidth;
  if (max <= 0) return;
  if ((this.scrollLeft <= 0 && e.deltaY < 0) || (this.scrollLeft >= max - 1 && e.deltaY > 0)) return;
  e.preventDefault();
  this.scrollLeft += e.deltaY;
}

/**
 * Lets a sideways-scrolling row (category chips) scroll with a normal mouse wheel: vertical
 * wheel movement becomes horizontal scrolling while the row can still move that way. Returns a
 * callback ref, so it also works for rows that appear later (the subcategory chips).
 */
export function useWheelScrollX<T extends HTMLElement>() {
  const current = useRef<T | null>(null);
  return useCallback((el: T | null) => {
    current.current?.removeEventListener("wheel", onWheel);
    current.current = el;
    // Not passive, so preventDefault keeps the page or map from scrolling instead.
    el?.addEventListener("wheel", onWheel, { passive: false });
  }, []);
}
