import { distanceMetres, type LatLng } from "../components/map/geo";

/** Straight-line walking estimate (R17.5): distance × 1.3 detour factor ÷ 80 m per minute. */
export const DETOUR = 1.3;
export const METRES_PER_MINUTE = 80;

export function walkMinutes(from: LatLng, to: LatLng): number {
  return Math.max(1, Math.ceil((distanceMetres(from, to) * DETOUR) / METRES_PER_MINUTE));
}

/** "~8 min walk", or the distance ("2.4 km") once it's over 30 minutes. */
export function walkLabel(from: LatLng, to: LatLng): string {
  const mins = walkMinutes(from, to);
  if (mins <= 30) return `~${mins} min walk`;
  const m = distanceMetres(from, to);
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent, touchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Hand directions off to the device's maps app (R17.6). Never a Google link. */
export function directionsUrl(place: { lat: number; lng: number; name: string }, platform: Platform): string {
  const { lat, lng } = place;
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (platform === "ios") return `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(place.name)}`;
  if (platform === "android") return `geo:${ll}?q=${ll}(${encodeURIComponent(place.name)})`;
  const [la, ln] = ll.split(",");
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${la}%2C${ln}#map=17/${la}/${ln}`;
}
