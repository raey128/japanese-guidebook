import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, type KeyboardEvent } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";

import { DEFAULT_VIEW, TILE_STYLE_URL } from "../../config";
import { NUDGE_METRES, NUDGE_METRES_SHIFT, directionForKey, formatCoords, nudge, type LatLng } from "./geo";

type Props = {
  lat: number | null;
  lng: number | null;
  draggable?: boolean;
  /** Clicking the map sets the pin (add-place form). */
  clickToSet?: boolean;
  onChange?: (p: LatLng) => void;
  height?: number;
  label?: string;
};

/** Single-pin map. Arrow keys nudge the pin when the group is focused (5 m, Shift = 50 m). */
export default function BasePinMap({ lat, lng, draggable, clickToSet, onChange, height = 220, label = "Pin location" }: Props) {
  const mapRef = useRef<MapRef>(null);
  const internal = useRef(false);
  const hasPin = lat !== null && lng !== null;
  const editable = Boolean(draggable && onChange);

  // Pan to pins set from outside (search, geolocation, nudging) but not to ones the user just dragged/clicked.
  useEffect(() => {
    if (lat === null || lng === null) return;
    if (internal.current) {
      internal.current = false;
      return;
    }
    const map = mapRef.current;
    if (map) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 400 });
  }, [lat, lng]);

  const set = (p: LatLng, fromMap: boolean) => {
    internal.current = fromMap;
    onChange?.(p);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || e.target !== e.currentTarget) return;
    const dir = directionForKey(e.key);
    if (!dir) return;
    e.preventDefault();
    const metres = e.shiftKey ? NUDGE_METRES_SHIFT : NUDGE_METRES;
    if (lat !== null && lng !== null) {
      set(nudge({ lat, lng }, dir, metres), false);
    } else {
      const c = mapRef.current?.getCenter();
      if (c) set({ lat: c.lat, lng: c.lng }, false);
    }
  };

  const dropAtCentre = () => {
    const c = mapRef.current?.getCenter();
    if (c) set({ lat: c.lat, lng: c.lng }, false);
  };

  return (
    <div>
      <div
        role="group"
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? `${label}. Focus here and use the arrow keys to move the pin 5 metres; hold Shift for 50 metres.` : label}
        onKeyDown={onKeyDown}
        className="overflow-hidden rounded border border-stone-300"
        style={{ height }}
        data-testid="pin-map"
      >
        <Map
          ref={mapRef}
          mapStyle={TILE_STYLE_URL}
          initialViewState={
            hasPin
              ? { latitude: lat, longitude: lng, zoom: 16 }
              : DEFAULT_VIEW
          }
          style={{ width: "100%", height: "100%" }}
          onClick={(e) => {
            if (clickToSet && onChange) set({ lat: e.lngLat.lat, lng: e.lngLat.lng }, true);
          }}
          cooperativeGestures={!clickToSet && !editable}
        >
          <NavigationControl showCompass={false} />
          {hasPin && (
            <Marker
              latitude={lat}
              longitude={lng}
              anchor="bottom"
              draggable={editable}
              onDragEnd={(e) => set({ lat: e.lngLat.lat, lng: e.lngLat.lng }, true)}
            >
              <svg width="28" height="38" viewBox="0 0 28 38" aria-hidden="true">
                <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 24 14 24s14-14 14-24C28 6.3 21.7 0 14 0z" fill="#b91c1c" stroke="#fff" strokeWidth="2" />
                <circle cx="14" cy="14" r="5" fill="#fff" />
              </svg>
            </Marker>
          )}
        </Map>
      </div>
      {editable && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          {!hasPin && clickToSet && (
            <button type="button" onClick={dropAtCentre} className="rounded border border-stone-400 px-2 py-1">
              Drop pin at map centre
            </button>
          )}
          <p aria-live="polite" className="text-stone-700" data-testid="pin-readout">
            {hasPin ? `Pin at ${formatCoords({ lat, lng })}` : "No pin yet. Tap the map, or use the options above."}
          </p>
        </div>
      )}
    </div>
  );
}
