import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { AttributionControl, Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import { useNavigate, useSearchParams } from "react-router";

import type { Schemas } from "../api/client";
import { prefersReducedMotion } from "../components/app/Celebration";
import { useInlineSignIn } from "../components/app/InlineSignIn";
import CategoryChips from "../components/home/CategoryChips";
import MenuDrawer from "../components/home/MenuDrawer";
import PlacePin from "../components/home/PlacePin";
import SearchBar from "../components/home/SearchBar";
import TopPicksSheet from "../components/home/TopPicksSheet";
import { createLongPress, roundBbox, type Bbox, type LatLng } from "../components/map/geo";
import PinSummary from "../components/map/PinSummary";
import { CLUSTER_MAX_ZOOM, DEFAULT_VIEW, TILE_STYLE_URL } from "../config";
import { COPY } from "../copy";
import { useMe } from "../hooks/auth";
import { useCities, useMapData, useSubcategories, useTopPicks, type MapQuery } from "../hooks/map";
import { usePlace } from "../hooks/places";
import { getLastCity, setLastCity } from "../lib/lastCity";
import { track } from "../lib/track";

/** Pins show their score from this zoom (R15.1). */
export const SCORE_ZOOM = 14;
const CITY_ZOOM = 12;
const AREA_ZOOM = 15;
const PLACE_ZOOM = 16;

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Source = "pin" | "top_pick" | "search" | "list" | "near_me";

/**
 * The first screen (R11.1): a full-screen map with a floating search bar + city picker, category
 * chips, a "Top picks here" sheet, Near me, and a floating + button. No site header or footer.
 */
export default function MapPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const { requireUser } = useInlineSignIn();
  const subs = useSubcategories();
  const cities = useCities();
  const cityList = useMemo(() => cities.data ?? [], [cities.data]);

  const category = params.get("category") ?? "";
  const savedOnly = signedIn && params.get("saved") === "1";
  const [city, setCity] = useState(() => {
    const fromUrl = params.get("city");
    return fromUrl || getLastCity();
  });

  const mapRef = useRef<MapRef>(null);
  const [view, setView] = useState<{ bbox: Bbox; rawBbox: Bbox; zoom: number } | null>(null);
  const [selected, setSelected] = useState<{ id: number; source: Source } | null>(() => {
    const id = num(params.get("place"));
    return id ? { id, source: "list" } : null;
  });
  const [mapReady, setMapReady] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  /** flyTo, or an instant jump with reduced motion (N3.6). */
  const goTo = useCallback((lng: number, lat: number, zoom: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (prefersReducedMotion()) map.jumpTo({ center: [lng, lat], zoom });
    else map.flyTo({ center: [lng, lat], zoom, duration: 1200 });
  }, []);

  const urlView = useMemo(() => {
    const lat = num(params.get("lat"));
    const lng = num(params.get("lng"));
    const z = num(params.get("z"));
    return lat !== null && lng !== null ? { latitude: lat, longitude: lng, zoom: z ?? CITY_ZOOM } : null;
    // Only the first render's URL decides the initial view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cityData = cityList.find((c) => c.slug === city) ?? cityList.find((c) => c.slug === "tokyo") ?? cityList[0];
  const initialView = useMemo(() => {
    if (urlView) return urlView;
    if (cityData) return { latitude: cityData.lat, longitude: cityData.lng, zoom: CITY_ZOOM };
    return DEFAULT_VIEW;
  }, [urlView, cityData]);

  const updateView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const zoom = Math.floor(map.getZoom());
    const raw = { minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() };
    setView({ bbox: roundBbox(raw, zoom), rawBbox: raw, zoom });
    const c = map.getCenter();
    setParam({ lat: c.lat.toFixed(4), lng: c.lng.toFixed(4), z: map.getZoom().toFixed(1) });
  }, [setParam]);

  // `?place=<id>` (from "Show on map" in Lists): centre on it once and open its summary.
  const focusId = num(params.get("place"));
  const focusPlace = usePlace(focusId);
  const focusedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (focusedRef.current || !mapReady || !map || !focusPlace.data) return;
    focusedRef.current = true;
    map.jumpTo({ center: [focusPlace.data.lng, focusPlace.data.lat], zoom: Math.max(map.getZoom(), PLACE_ZOOM) });
    track("place_open", "list");
    setParam({ place: "" });
  }, [mapReady, focusPlace.data, setParam]);

  const query: MapQuery | null = view
    ? { bbox: view.bbox, zoom: view.zoom, category, mode: savedOnly ? "want_to_go" : "all" }
    : null;
  const data = useMapData(query);
  const result = data.data;
  const picks = useTopPicks(view?.bbox ?? null, category);

  const subList = useMemo(() => subs.data ?? [], [subs.data]);
  const subName = useMemo(() => new globalThis.Map(subList.map((s) => [s.slug, s.name])), [subList]);

  const startAdd = useCallback(
    (p: LatLng, extra = "") => {
      requireUser(
        () => void navigate(`/places/new?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}${extra}`),
        "Pick a username to add places",
      );
    },
    [navigate, requireUser],
  );
  const addAtCentre = useCallback(
    (extra = "") => {
      const c = mapRef.current?.getCenter();
      startAdd(c ? { lat: c.lat, lng: c.lng } : { lat: initialView.latitude, lng: initialView.longitude }, extra);
    },
    [startAdd, initialView],
  );

  const longPress = useMemo(() => createLongPress<LatLng>((p) => startAdd(p), 600, 10), [startAdd]);
  useEffect(() => () => longPress.cancel(), [longPress]);

  const selectPlace = useCallback(
    (place: { id: number; lat: number; lng: number }, source: Source) => {
      setSelected({ id: place.id, source });
      setSheetExpanded(false);
      const map = mapRef.current;
      if (map) goTo(place.lng, place.lat, Math.max(map.getZoom(), PLACE_ZOOM));
    },
    [goTo],
  );

  function changeCity(slug: string) {
    setCity(slug);
    setLastCity(slug);
    const c = cityList.find((x) => x.slug === slug);
    if (c) goTo(c.lng, c.lat, CITY_ZOOM);
  }

  function pickArea(loc: Schemas["LocationOut"]) {
    // Areas have no boundaries: move the map, never filter pins (R11.4, X8).
    if (loc.lat !== null && loc.lng !== null) goTo(loc.lng, loc.lat, AREA_ZOOM);
    else if (cityData) goTo(cityData.lng, cityData.lat, CITY_ZOOM);
  }

  function nearMe() {
    if (!("geolocation" in navigator)) {
      setToast(COPY.locationDenied);
      track("near_me", "denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(p);
        track("near_me", "granted");
        goTo(p.lng, p.lat, AREA_ZOOM);
      },
      () => {
        setToast(COPY.locationDenied);
        track("near_me", "denied");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const showScores = (view?.zoom ?? 0) >= SCORE_ZOOM;
  const pickSource: Source = userLoc ? "near_me" : "top_pick";

  return (
    <div className="map-home fixed inset-0 overflow-hidden bg-canvas" data-testid="map-container">
      <h1 className="sr-only">Map</h1>
      {cities.isPending ? (
        <div className="flex h-full items-center justify-center">
          <p role="status" className="font-bold text-muted">
            {COPY.loading}
          </p>
        </div>
      ) : (
        <Map
          ref={mapRef}
          mapStyle={TILE_STYLE_URL}
          initialViewState={initialView}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          onLoad={() => {
            setMapReady(true);
            updateView();
          }}
          onMoveEnd={updateView}
          onClick={() => setSelected(null)}
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
        >
          <NavigationControl position="top-right" showCompass={false} />
          <AttributionControl position="top-right" compact />

          {userLoc ? (
            <Marker latitude={userLoc.lat} longitude={userLoc.lng} anchor="center">
              <span role="img" aria-label="You are here" className="block size-5 rounded-full border-[3px] border-white bg-stays shadow-[0_0_0_6px_rgba(25,113,194,0.25)]" />
            </Marker>
          ) : null}

          {result?.kind === "clusters" &&
            result.clusters.map((c) => (
              <Marker key={`${c.lat},${c.lng}`} latitude={c.lat} longitude={c.lng} anchor="center">
                <button
                  type="button"
                  aria-label={`${c.count} ${c.count === 1 ? "place" : "places"}, zoom in`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const map = mapRef.current;
                    if (map) goTo(c.lng, c.lat, Math.min(map.getZoom() + 2, 18));
                  }}
                  className="flex size-11 items-center justify-center rounded-full border-[3px] border-white bg-brand text-sm font-extrabold text-white shadow-md"
                  style={{ transform: `scale(${Math.min(1.6, 1 + Math.log10(c.count) * 0.25)})` }}
                >
                  {c.count}
                </button>
              </Marker>
            ))}

          {result?.kind === "points" &&
            result.points.map((p) => (
              <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="bottom" style={{ zIndex: selected?.id === p.id ? 5 : undefined }}>
                <PlacePin
                  point={p}
                  categoryName={subName.get(p.subcategory_slug) ?? p.subcategory_slug}
                  selected={selected?.id === p.id}
                  showScore={showScores}
                  onSelect={() => {
                    setSelected({ id: p.id, source: "pin" });
                    setSheetExpanded(false);
                    track("place_open", "pin");
                  }}
                />
              </Marker>
            ))}
        </Map>
      )}

      {/* Top overlay: menu + search bar, then category chips. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 pt-3">
        <div className="pointer-events-auto mx-auto flex max-w-2xl items-start gap-2 px-3">
          <MenuDrawer />
          <div className="min-w-0 flex-1">
            <SearchBar
              cities={cityList}
              city={cityData?.slug ?? city}
              onCity={changeCity}
              category={category}
              bbox={view?.rawBbox ?? null}
              initialQuery={params.get("q") ?? ""}
              onPickArea={pickArea}
              onPickSubcategory={(s) => setParam({ category: s.slug })}
              onPickPlace={(p) => selectPlace(p, "search")}
              onAddManually={(text) => addAtCentre(`&source=manual&name=${encodeURIComponent(text)}`)}
              onOpenChange={(open) => {
                if (open) setSheetExpanded(false);
              }}
            />
          </div>
        </div>
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <CategoryChips
            category={category}
            onCategory={(slug) => setParam({ category: slug })}
            subcategories={subList}
            showSaved={signedIn}
            savedOnly={savedOnly}
            onSavedOnly={(v) => setParam({ saved: v ? "1" : "" })}
          />
        </div>
        <div aria-live="polite" className="flex flex-col items-center gap-1 px-3 text-sm">
          {toast ? <p className="pointer-events-auto card px-3 py-2 font-bold shadow">{toast}</p> : null}
          {data.isError ? (
            <p role="alert" className="card border-red-300 px-3 py-1.5 font-bold text-danger">
              {COPY.loadError}
            </p>
          ) : null}
          {result?.kind === "points" && result.truncated ? (
            <p className="card px-3 py-1.5 font-bold">Lots of places here! Zoom in to see them all.</p>
          ) : null}
          {result?.kind === "clusters" ? (
            <p className="sr-only">
              {result.clusters.length} clusters shown. Zoom to level {CLUSTER_MAX_ZOOM} to see individual places.
            </p>
          ) : null}
          {result?.kind === "points" ? <p className="sr-only">{result.points.length} places shown.</p> : null}
        </div>
      </div>

      {/* Bottom overlay: floating buttons sit above the sheet / place summary, never on top of them. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl flex-col">
        <div className="flex items-end justify-end gap-2 px-3 pb-3">
          <button type="button" onClick={nearMe} className="pointer-events-auto btn btn-secondary shadow-lg">
            <span aria-hidden="true">📍</span> {COPY.nearMe}
          </button>
          <button
            type="button"
            aria-label={COPY.addPlace}
            onClick={() => addAtCentre()}
            className="pointer-events-auto btn btn-primary btn-icon size-14 text-3xl shadow-lg"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
        {selected !== null ? (
          <div className="px-2 pb-2">
            <PinSummary
              placeId={selected.id}
              onClose={() => setSelected(null)}
              userLoc={userLoc}
              saveSource={selected.source === "near_me" ? "top_pick" : selected.source}
            />
          </div>
        ) : (
          <TopPicksSheet
            data={picks.data}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            userLoc={userLoc}
            onPick={(p) => {
              track("place_open", pickSource);
              selectPlace(p, pickSource);
            }}
            onAddPlace={() => addAtCentre()}
          />
        )}
      </div>
    </div>
  );
}
