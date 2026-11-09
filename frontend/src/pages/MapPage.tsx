import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { AttributionControl, Marker, type MapRef } from "react-map-gl/maplibre";
import { useSearchParams } from "react-router";

import type { Schemas } from "../api/client";
import { prefersReducedMotion } from "../components/app/Celebration";
import { useInlineSignIn } from "../components/app/InlineSignIn";
import { TAB_BAR_HEIGHT } from "../components/app/TabBar";
import AddPlacePanel from "../components/home/AddPlacePanel";
import CategoryChips from "../components/home/CategoryChips";
import MenuDrawer from "../components/home/MenuDrawer";
import PlacePin from "../components/home/PlacePin";
import SearchBar from "../components/home/SearchBar";
import TopPicksPanel, { loadPicksOpen, savePicksOpen } from "../components/home/TopPicksPanel";
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
/** Zoom while placing a new pin: close enough to put it on the right building. */
const ADD_ZOOM = 17;
/** The add panel covers at most this share of the screen height. */
const ADD_PANEL_SHARE = 0.55;

function addPanelPadding(): number {
  return Math.round(window.innerHeight * ADD_PANEL_SHARE) + 8;
}

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
  const [picksOpen, setPicksOpenState] = useState(loadPicksOpen);
  const setPicksOpen = useCallback((v: boolean) => {
    setPicksOpenState(v);
    savePicksOpen(v);
  }, []);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Add a place happens right here on the map (R13.12): `?add=1` opens the panel, `addPin` is the one pin.
  const adding = params.get("add") === "1";
  const [addPin, setAddPin] = useState<LatLng | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pinEditing, setPinEditing] = useState(false);
  // Where the map was when the panel opened: name suggestions prefer places near here.
  const [addNear, setAddNear] = useState<LatLng | null>(null);

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

  type AddExtra = { name?: string; source?: "manual" };
  const round6 = (p: LatLng) => ({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });

  /** Bring the new pin into view above the panel, zoomed in on it. */
  const flyToPin = useCallback((p: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    // Offset (not padding) so the pin lands above the panel without changing the map for later.
    const options = {
      center: [p.lng, p.lat] as [number, number],
      zoom: Math.max(map.getZoom(), ADD_ZOOM),
      offset: [0, -addPanelPadding() / 2] as [number, number],
    };
    if (prefersReducedMotion()) map.jumpTo(options);
    else map.flyTo({ ...options, duration: 1200 });
  }, []);

  /**
   * Open Add a place (R13.12). Search comes first: the panel opens on the name field and the map
   * stays where it is, with no pin until a place is picked. `at` (long-press, old links) starts
   * with a pin there instead.
   */
  const startAdd = useCallback(
    (extra: AddExtra = {}, at?: LatLng) => {
      requireUser(() => {
        setSelected(null);
        const c = mapRef.current?.getCenter();
        setAddNear(at ?? (c ? { lat: c.lat, lng: c.lng } : null));
        setAddPin(at ? round6(at) : null);
        setPinEditing(false);
        setAddOpen(true);
        setParam({ add: "1", name: extra.name ?? "", source: extra.source ?? "" });
      }, "Pick a username to add places");
    },
    [requireUser, setParam],
  );

  /** A place picked from the search (or an address, or my location): pin it and zoom there. */
  const pinFromSearch = useCallback(
    (p: LatLng) => {
      setAddPin(round6(p));
      setPinEditing(false);
      flyToPin(p);
    },
    [flyToPin],
  );
  /** Moving the pin by hand, only in Edit pin mode: drag it or tap the map. The camera stays put. */
  const pinByHand = useCallback((p: LatLng) => setAddPin(round6(p)), []);

  const editPin = useCallback(() => {
    const map = mapRef.current;
    if (!addPin && map) {
      // No pin yet: start in the middle of the part of the map the panel doesn't cover.
      const el = map.getContainer();
      const c = map.unproject([el.clientWidth / 2, Math.max(80, (el.clientHeight - addPanelPadding()) / 2)]);
      setAddPin(round6({ lat: c.lat, lng: c.lng }));
    } else if (addPin && map) {
      const pt = map.project([addPin.lng, addPin.lat]);
      const el = map.getContainer();
      if (pt.x < 0 || pt.x > el.clientWidth || pt.y < 0 || pt.y > el.clientHeight - addPanelPadding()) flyToPin(addPin);
    }
    setPinEditing(true);
  }, [addPin, flyToPin]);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setAddPin(null);
    setPinEditing(false);
    setParam({ add: "", name: "", source: "", pin_lat: "", pin_lng: "" });
  }, [setParam]);

  // Arriving with `?add=1` (old /places/new links, a reload): open the panel, signing in first.
  const addStarted = useRef(false);
  useEffect(() => {
    if (!adding || addOpen || addStarted.current || !mapReady || me.isPending) return;
    addStarted.current = true;
    const name = params.get("name") ?? "";
    const source = params.get("source") === "manual" ? "manual" : undefined;
    const lat = num(params.get("pin_lat"));
    const lng = num(params.get("pin_lng"));
    const at = lat !== null && lng !== null ? { lat, lng } : undefined;
    setParam({ add: "" });
    startAdd({ name, source }, at);
    if (at) flyToPin(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, addOpen, mapReady, me.isPending]);
  const showAdd = adding && addOpen;

  const longPress = useMemo(
    () =>
      createLongPress<LatLng>(
        (p) => {
          if (!showAdd) startAdd({}, p);
          else if (pinEditing) pinByHand(p);
        },
        600,
        10,
      ),
    [startAdd, pinByHand, showAdd, pinEditing],
  );
  useEffect(() => () => longPress.cancel(), [longPress]);

  const selectPlace = useCallback(
    (place: { id: number; lat: number; lng: number }, source: Source) => {
      setSelected({ id: place.id, source });
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
    <div
      className="map-home fixed inset-x-0 top-0 overflow-hidden bg-canvas"
      // Ends at the tab bar (Map | Lists), which sits below it.
      style={{ bottom: `calc(${TAB_BAR_HEIGHT} + env(safe-area-inset-bottom))` }}
      data-testid="map-container"
    >
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
          onClick={(e) => {
            if (showAdd) {
              if (pinEditing) pinByHand({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            } else setSelected(null);
          }}
          onContextMenu={(e) => {
            e.originalEvent.preventDefault();
            const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
            if (!showAdd) startAdd({}, p);
            else if (pinEditing) pinByHand(p);
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
          <AttributionControl position="top-right" compact />

          {showAdd && addPin ? (
            <Marker
              latitude={addPin.lat}
              longitude={addPin.lng}
              anchor="bottom"
              draggable={pinEditing}
              onDragEnd={(e) => pinByHand({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
              style={{ zIndex: 10 }}
            >
              <span
                role="img"
                aria-label={pinEditing ? "New place pin. Drag it, or tap the map, to move it." : "New place pin"}
                data-testid="add-pin"
                className={`block text-5xl leading-none drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)] ${
                  pinEditing ? "cursor-grab animate-bounce active:cursor-grabbing motion-reduce:animate-none" : ""
                }`}
              >
                📍
              </span>
            </Marker>
          ) : null}

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
              <Marker
                key={p.id}
                latitude={p.lat}
                longitude={p.lng}
                anchor="bottom"
                // While adding, other pins fade and let taps through to move the new pin.
                style={{
                  zIndex: selected?.id === p.id ? 5 : undefined,
                  opacity: showAdd && pinEditing ? 0.45 : undefined,
                  pointerEvents: showAdd ? "none" : undefined,
                }}
              >
                <PlacePin
                  point={p}
                  categoryName={subName.get(p.subcategory_slug) ?? p.subcategory_slug}
                  selected={selected?.id === p.id}
                  showScore={showScores}
                  onSelect={() => {
                    setSelected({ id: p.id, source: "pin" });
                    track("place_open", "pin");
                  }}
                />
              </Marker>
            ))}
        </Map>
      )}

      {/* Top overlay: menu + search bar, then category chips (hidden while adding a place). */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 pt-3 ${showAdd ? "hidden" : ""}`}>
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
              onAddManually={(text) => startAdd({ source: "manual", name: text })}
              onOpenChange={(open) => {
                if (open && window.innerWidth < 640) setPicksOpen(false);
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

      {/* Zoom controls, always there (R13.14): in, out, and back to the whole city. */}
      <div
        role="group"
        aria-label="Map zoom"
        className="absolute right-3 z-20 flex flex-col overflow-hidden rounded-(--radius-chunky) border-2 border-b-4 border-line bg-white shadow-lg"
        style={{ top: showAdd ? "1rem" : "9.5rem" }}
      >
        <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="flex size-11 items-center justify-center text-2xl font-extrabold hover:bg-stone-100">
          <span aria-hidden="true">+</span>
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="flex size-11 items-center justify-center border-t-2 border-line text-2xl font-extrabold hover:bg-stone-100">
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          aria-label={`Show all of ${cityData?.name ?? "the city"}`}
          title={`Show all of ${cityData?.name ?? "the city"}`}
          onClick={() => {
            if (cityData) goTo(cityData.lng, cityData.lat, CITY_ZOOM);
          }}
          className="flex size-11 items-center justify-center border-t-2 border-line text-xl hover:bg-stone-100"
        >
          <span aria-hidden="true">🗾</span>
        </button>
      </div>

      {/* Top picks: a side panel you can hide (R15.6). */}
      {!showAdd ? (
        <div className="pointer-events-none absolute left-0 z-10 flex items-start" style={{ top: "9.5rem", bottom: "5.5rem" }}>
          <TopPicksPanel
            data={picks.data}
            open={picksOpen}
            onOpenChange={setPicksOpen}
            userLoc={userLoc}
            onPick={(p) => {
              track("place_open", pickSource);
              selectPlace(p, pickSource);
              if (window.innerWidth < 640) setPicksOpen(false);
            }}
            onAddPlace={() => startAdd()}
          />
        </div>
      ) : null}

      {/* Bottom overlay: floating buttons sit above the place summary, never on top of it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl flex-col">
        {showAdd ? (
          <div
            className="pointer-events-auto mx-2 mb-2 overflow-y-auto overscroll-contain rounded-(--radius-card) border-2 border-b-4 border-line bg-white p-4 shadow-xl"
            style={{ maxHeight: `${ADD_PANEL_SHARE * 100}vh` }}
            data-testid="add-panel"
            onKeyDown={(e) => {
              if (e.key === "Escape") closeAdd();
            }}
          >
            <AddPlacePanel
              pin={addPin}
              onPinFromSearch={pinFromSearch}
              pinEditing={pinEditing}
              onEditPin={editPin}
              onDoneEditing={() => setPinEditing(false)}
              near={addNear}
              onPickExisting={(place) => {
                closeAdd();
                selectPlace(place, "search");
              }}
              city={cityData ? { slug: cityData.slug, lat: cityData.lat, lng: cityData.lng } : null}
              initialName={params.get("name") ?? ""}
              manual={params.get("source") === "manual"}
              onClose={closeAdd}
              onCreated={(id, name) => {
                closeAdd();
                setSelected({ id, source: "pin" });
                setToast(`📍 Pin added! ${name} is on the map.`);
              }}
            />
          </div>
        ) : null}
        <div className={`flex items-end gap-2 px-3 pb-3 ${showAdd ? "hidden" : ""}`}>
          <span className="flex-1" />
          <button type="button" onClick={nearMe} className="pointer-events-auto btn btn-secondary shadow-lg">
            <span aria-hidden="true">📍</span> {COPY.nearMe}
          </button>
          <button
            type="button"
            aria-label={COPY.addPlace}
            onClick={() => startAdd()}
            className="pointer-events-auto btn btn-primary btn-icon size-14 text-3xl shadow-lg"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
        {showAdd ? null : selected !== null ? (
          <div className="px-2 pb-2">
            <PinSummary
              placeId={selected.id}
              onClose={() => setSelected(null)}
              userLoc={userLoc}
              saveSource={selected.source === "near_me" ? "top_pick" : selected.source}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
