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
    const strip = () => {
      const wrapper = ref.current?.closest(".maplibregl-marker");
      if (!wrapper) return;
      wrapper.removeAttribute("role");
      wrapper.removeAttribute("aria-label");
      wrapper.removeAttribute("tabindex");
    };
    strip();
    // The parent <Marker> adds the marker to the map (which sets those attributes) in its own
    // effect, which runs after this child's; strip again on the next frame.
    const frame = requestAnimationFrame(strip);
    return () => cancelAnimationFrame(frame);
  });
  return (
    <span ref={ref} style={{ display: "contents" }}>
      {children}
    </span>
  );
}
