/** Pure helpers for the map and add-place features (unit tested in geo.test.ts). */

export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };
export type LatLng = { lat: number; lng: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fix = (v: number) => Number(v.toFixed(6));

/**
 * Snap a bbox outward to a grid that scales with zoom (1/16 of a 256px tile), so small pans
 * reuse the cached query and the request bbox equals the cache key. Clamped to valid ranges.
 */
export function roundBbox(b: Bbox, zoom: number): Bbox {
  const step = 360 / 2 ** Math.max(0, zoom) / 16;
  return {
    minLat: fix(clamp(Math.floor(b.minLat / step) * step, -90, 90)),
    minLng: fix(clamp(Math.floor(b.minLng / step) * step, -180, 180)),
    maxLat: fix(clamp(Math.ceil(b.maxLat / step) * step, -90, 90)),
    maxLng: fix(clamp(Math.ceil(b.maxLng / step) * step, -180, 180)),
  };
}

export const NUDGE_METRES = 5;
export const NUDGE_METRES_SHIFT = 50;
const METRES_PER_DEG_LAT = 111_320;

export type Direction = "up" | "down" | "left" | "right";

/** Move a point `metres` in a compass direction. */
export function nudge(p: LatLng, dir: Direction, metres: number): LatLng {
  const dLat = metres / METRES_PER_DEG_LAT;
  const cos = Math.max(0.01, Math.cos((p.lat * Math.PI) / 180));
  const dLng = metres / (METRES_PER_DEG_LAT * cos);
  let { lat, lng } = p;
  if (dir === "up") lat += dLat;
  if (dir === "down") lat -= dLat;
  if (dir === "left") lng -= dLng;
  if (dir === "right") lng += dLng;
  return { lat: fix(clamp(lat, -90, 90)), lng: fix(clamp(lng, -180, 180)) };
}

export function directionForKey(key: string): Direction | null {
  switch (key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    default: return null;
  }
}

/** Great-circle distance in metres. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function formatCoords(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

/**
 * Long-press detector: call start() on touchstart, move() on touchmove, cancel() on
 * touchend/drag/zoom. `onLongPress` fires once if the finger stays within `tolerance` px
 * for `delayMs`.
 */
export function createLongPress<T>(onLongPress: (payload: T) => void, delayMs = 600, tolerance = 10) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: { x: number; y: number } | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    origin = null;
  };
  return {
    start(x: number, y: number, payload: T) {
      cancel();
      origin = { x, y };
      timer = setTimeout(() => {
        timer = null;
        origin = null;
        onLongPress(payload);
      }, delayMs);
    },
    move(x: number, y: number) {
      if (origin && Math.hypot(x - origin.x, y - origin.y) > tolerance) cancel();
    },
    cancel,
  };
}

export type FormErrors = {
  fields: Record<string, string>;
  message: string | null;
  coveredCities: { id: number; slug: string; name: string }[] | null;
};

/** Map a FastAPI error body to inline field errors keyed by loc[-1] (lat/lng become "pin"). */
export function mapApiErrors(body: unknown): FormErrors {
  const out: FormErrors = { fields: {}, message: null, coveredCities: null };
  if (typeof body !== "object" || body === null) return out;
  const { detail, covered_cities } = body as { detail?: unknown; covered_cities?: unknown };
  if (Array.isArray(covered_cities)) out.coveredCities = covered_cities as FormErrors["coveredCities"];
  if (typeof detail === "string") {
    out.message = detail;
  } else if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item !== "object" || item === null) continue;
      const { loc, msg } = item as { loc?: unknown[]; msg?: unknown };
      const last = Array.isArray(loc) ? String(loc[loc.length - 1]) : "";
      const key = last === "lat" || last === "lng" ? "pin" : last;
      const text = typeof msg === "string" ? msg.replace(/^Value error, /, "") : "Invalid value.";
      if (key && !(key in out.fields)) out.fields[key] = text;
      else if (!key && out.message === null) out.message = text;
    }
  }
  return out;
}

export const TOP_CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  sights: "Sights",
  stays: "Stays",
  experiences: "Experiences",
};
export const TOP_CATEGORY_ORDER = ["food", "sights", "stays", "experiences"];

export function groupByTopCategory<T extends { top_category: string }>(items: T[]): { key: string; label: string; items: T[] }[] {
  return TOP_CATEGORY_ORDER.map((key) => ({
    key,
    label: TOP_CATEGORY_LABELS[key] ?? key,
    items: items.filter((i) => i.top_category === key),
  })).filter((g) => g.items.length > 0);
}
