import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { GeolocateControl, Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import { useNavigate, useSearchParams } from "react-router";

import { CLUSTER_MAX_ZOOM, DEFAULT_VIEW, TILE_STYLE_URL } from "../config";
import { createLongPress, groupByTopCategory, roundBbox, type LatLng } from "../components/map/geo";
import PinSummary from "../components/map/PinSummary";
import { useMe } from "../hooks/auth";
import { useCities, useMapData, useSubcategories, type MapMode, type MapQuery } from "../hooks/map";

const MODES: { value: MapMode; label: string; needsUser: boolean }[] = [
  { value: "all", label: "All places", needsUser: false },
  { value: "mine", label: "My rankings", needsUser: true },
  { value: "want_to_go", label: "Want to go", needsUser: true },
];

function num(v: string | null, fallback: number): number {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function MapPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const subs = useSubcategories();
  const cities = useCities();

  const category = params.get("category") ?? "";
  const location = params.get("location") ?? "";
  const rawMode = params.get("mode");
  const mode: MapMode = rawMode === "mine" || rawMode === "want_to_go" ? (signedIn ? rawMode : "all") : "all";

  const mapRef = useRef<MapRef>(null);
  const [view, setView] = useState<{ bbox: ReturnType<typeof roundBbox>; zoom: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const addModeRef = useRef(false);
  addModeRef.current = addMode;

  const initialView = useMemo(
    () => ({
      latitude: num(params.get("lat"), DEFAULT_VIEW.latitude),
      longitude: num(params.get("lng"), DEFAULT_VIEW.longitude),
      zoom: num(params.get("z"), DEFAULT_VIEW.zoom),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const updateView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const zoom = Math.floor(map.getZoom());
    setView({
      bbox: roundBbox({ minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() }, zoom),
      zoom,
    });
    const c = map.getCenter();
    setParam({ lat: c.lat.toFixed(4), lng: c.lng.toFixed(4), z: map.getZoom().toFixed(1) });
  }, [setParam]);

  const query: MapQuery | null = view ? { bbox: view.bbox, zoom: view.zoom, category, location, mode } : null;
  const data = useMapData(query);
  const result = data.data;

  const startAdd = useCallback(
    (p: LatLng) => {
      void navigate(`/places/new?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}`);
    },
    [navigate],
  );

  const longPress = useMemo(() => createLongPress<LatLng>(startAdd, 600, 10), [startAdd]);
  useEffect(() => () => longPress.cancel(), [longPress]);

  const modeLabel = MODES.find((m) => m.value === mode)?.label ?? "All places";
  const field = "rounded border border-stone-400 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-2">
      <h1 className="sr-only">Map</h1>
      <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Map filters">
        <div>
          <label htmlFor="map-category" className="block text-xs font-medium text-stone-800">
            Category
          </label>
          <select id="map-category" value={category} onChange={(e) => setParam({ category: e.target.value })} className={field}>
            <option value="">All categories</option>
            {groupByTopCategory(subs.data ?? []).map((g) => (
              <optgroup key={g.key} label={g.label}>
                <option value={g.key}>All {g.label}</option>
                {g.items.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="map-location" className="block text-xs font-medium text-stone-800">
            Location
          </label>
          <select id="map-location" value={location} onChange={(e) => setParam({ location: e.target.value })} className={field}>
            <option value="">All locations</option>
            {(cities.data ?? []).map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.locations.map((l) => (
                  <option key={l.id} value={l.slug}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Show">
          <span className="block text-xs font-medium text-stone-800">Show</span>
          <div className="flex overflow-hidden rounded border border-stone-400">
            {MODES.filter((m) => !m.needsUser || signedIn).map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => setParam({ mode: m.value === "all" ? "" : m.value })}
                className={`px-2 py-1.5 text-sm ${mode === m.value ? "bg-brand text-white" : "bg-white text-stone-900 hover:bg-stone-100"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-pressed={addMode}
          onClick={() => setAddMode((v) => !v)}
          className="ml-auto rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Add place
        </button>
      </div>

      {addMode && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded border border-amber-600 bg-amber-50 p-2 text-sm text-amber-950">
          <span>Tap the map to drop a pin there.</span>
          <button
            type="button"
            className="rounded border border-stone-700 bg-white px-2 py-1"
            onClick={() => {
              const c = mapRef.current?.getCenter();
              if (c) startAdd({ lat: c.lat, lng: c.lng });
            }}
          >
            Use map centre
          </button>
          <button type="button" className="rounded border border-stone-700 bg-white px-2 py-1" onClick={() => navigate("/places/new")}>
            Search by address instead
          </button>
          <button type="button" className="rounded px-2 py-1 underline" onClick={() => setAddMode(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="relative h-[calc(100dvh-11rem)] min-h-[420px] overflow-hidden rounded border border-stone-300" data-testid="map-container">
        <Map
          ref={mapRef}
          mapStyle={TILE_STYLE_URL}
          initialViewState={initialView}
          style={{ width: "100%", height: "100%" }}
          onLoad={updateView}
          onMoveEnd={updateView}
          onClick={(e) => {
            if (addModeRef.current) startAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            else setSelected(null);
          }}
          onContextMenu={(e) => {
            e.originalEvent.preventDefault();
            startAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          }}
          onTouchStart={(e) => {
            const t = e.originalEvent.touches;
            if (t.length === 1) longPress.start(e.point.x, e.point.y, { lat: e.lngLat.lat, lng: e.lngLat.lng });
            else longPress.cancel();
          }}
          onTouchMove={(e) => longPress.move(e.point.x, e.point.y)}
          onTouchEnd={() => longPress.cancel()}
          onTouchCancel={() => longPress.cancel()}
          onDragStart={() => longPress.cancel()}
          onZoomStart={() => longPress.cancel()}
          cursor={addMode ? "crosshair" : undefined}
        >
          <NavigationControl showCompass={false} />
          <GeolocateControl />

          {result?.kind === "clusters" &&
            result.clusters.map((c) => (
              <Marker key={`${c.lat},${c.lng}`} latitude={c.lat} longitude={c.lng} anchor="center">
                <button
                  type="button"
                  aria-label={`${c.count} ${c.count === 1 ? "place" : "places"}, zoom in`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const map = mapRef.current;
                    if (map) map.flyTo({ center: [c.lng, c.lat], zoom: Math.min(map.getZoom() + 2, 18) });
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-brand text-sm font-bold text-white shadow"
                  style={{ transform: `scale(${Math.min(1.6, 1 + Math.log10(c.count) * 0.25)})` }}
                >
                  {c.count}
                </button>
              </Marker>
            ))}

          {result?.kind === "points" &&
            result.points.map((p) => (
              <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="bottom">
                <button
                  type="button"
                  aria-label={p.name}
                  aria-pressed={selected === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(p.id);
                  }}
                  className={`block h-6 w-6 rounded-full border-2 border-white shadow ${selected === p.id ? "bg-brand-dark ring-2 ring-blue-600" : "bg-brand"}`}
                />
              </Marker>
            ))}
        </Map>

        <div aria-live="polite" className="pointer-events-none absolute left-2 top-2 max-w-[70%] space-y-1 text-sm">
          {data.isFetching && <p className="inline-block rounded bg-white/90 px-2 py-1 text-stone-800">Loading…</p>}
          {data.isError && <p role="alert" className="inline-block rounded bg-red-50 px-2 py-1 text-red-900">Couldn't load places.</p>}
          {result?.kind === "points" && result.truncated && (
            <p className="rounded bg-white/90 px-2 py-1 text-stone-900">Showing first 2,000 places — zoom in</p>
          )}
          {result?.kind === "clusters" && (
            <p className="sr-only">
              {result.clusters.length} clusters shown. Zoom to level {CLUSTER_MAX_ZOOM} to see individual places.
            </p>
          )}
          {result?.kind === "points" && <p className="sr-only">{result.points.length} places shown. Filter: {modeLabel}.</p>}
        </div>

        {selected !== null && <PinSummary placeId={selected} onClose={() => setSelected(null)} />}
      </div>
      <p className="text-xs text-stone-700">
        Long-press or right-click the map to add a place there.
      </p>
    </div>
  );
}
