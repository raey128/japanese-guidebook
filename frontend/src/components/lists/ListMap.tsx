import "maplibre-gl/dist/maplibre-gl.css";

import { useMemo, useRef } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";

import type { Schemas } from "../../api/client";
import { TILE_STYLE_URL } from "../../config";
import { artFor } from "../../lib/placeArt";
import MarkerContent from "../map/MarkerContent";

type Place = Schemas["PlaceSummary"];

/** A list's places on a small map, one pin per place in its kind's colour (decided 2026-11-27). */
export default function ListMap({ places, onPick }: { places: Place[]; onPick?: (p: Place) => void }) {
  const ref = useRef<MapRef>(null);
  const bounds = useMemo(() => {
    if (!places.length) return null;
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [places]);
  if (!bounds) return null;
  const centre = { longitude: (bounds[0][0] + bounds[1][0]) / 2, latitude: (bounds[0][1] + bounds[1][1]) / 2 };

  return (
    <div className="h-56 overflow-hidden rounded-(--radius-card) border-2 border-line" aria-label="Map of the places" role="region">
      <Map
        ref={ref}
        mapStyle={TILE_STYLE_URL}
        initialViewState={{ ...centre, zoom: 12 }}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => {
          if (places.length > 1) ref.current?.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
        }}
        attributionControl={{ compact: true }}
        cooperativeGestures
      >
        {places.map((p) => {
          const art = artFor(p.subcategory.slug, p.subcategory.top_category);
          return (
            <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="center">
              <MarkerContent>
                <button
                  type="button"
                  aria-label={p.name}
                  onClick={() => onPick?.(p)}
                  className="flex size-9 items-center justify-center rounded-full border-[3px] border-white text-base shadow-md"
                  style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}
                >
                  <span aria-hidden="true">{art.emoji}</span>
                </button>
              </MarkerContent>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
