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
    const strip = () => {
      if (wrapper.hasAttribute("role")) wrapper.removeAttribute("role");
      if (wrapper.hasAttribute("aria-label")) wrapper.removeAttribute("aria-label");
      if (wrapper.hasAttribute("tabindex")) wrapper.removeAttribute("tabindex");
    };
    strip();
    // MapLibre sets them again whenever it (re)adds the marker to the map, which can happen
    // after this effect; watch for that and strip them each time.
    const watcher = new MutationObserver(strip);
    watcher.observe(wrapper, { attributes: true, attributeFilter: ["role", "aria-label", "tabindex"] });
    return () => watcher.disconnect();
  }, []);

  return (
    <span ref={ref} style={{ display: "contents" }}>
      {children}
    </span>
  );
}
