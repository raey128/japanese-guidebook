import { useEffect, useRef, type ReactNode } from "react";

/**
 * Content for a react-map-gl <Marker>. MapLibre gives every marker's wrapper `role="button"`,
 * `aria-label="Map marker"` and a tabindex; our pins are real buttons inside it, so that made a
 * button inside a button (axe "nested-interactive") and the wrapper swallowed clicks. This strips
 * those attributes from the wrapper so only our own control is interactive.
 */
export default function MarkerContent({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const wrapper = ref.current?.closest(".maplibregl-marker");
    if (!wrapper) return;
    wrapper.removeAttribute("role");
    wrapper.removeAttribute("aria-label");
    wrapper.removeAttribute("tabindex");
  });
  return (
    <span ref={ref} style={{ display: "contents" }}>
      {children}
    </span>
  );
}
