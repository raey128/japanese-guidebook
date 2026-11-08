/** Frontend config. Map tiles: OpenFreeMap for the MVP; swap via VITE_TILE_STYLE_URL. */
export const TILE_STYLE_URL: string =
  import.meta.env.VITE_TILE_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

/** Initial map view: roughly all launch cities. */
export const DEFAULT_VIEW = { latitude: 36.2, longitude: 137.5, zoom: 5 };

/** Below this zoom the API returns clusters (mirrors the backend's cluster_max_zoom). */
export const CLUSTER_MAX_ZOOM = 11;
