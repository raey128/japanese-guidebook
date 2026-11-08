import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import type { Bbox } from "../components/map/geo";

export type MapMode = "all" | "mine" | "want_to_go";

export type MapQuery = {
  bbox: Bbox; // already rounded, so it doubles as the cache key
  zoom: number;
  category: string;
  location: string;
  mode: MapMode;
};

export function useMapData(q: MapQuery | null) {
  return useQuery({
    queryKey: ["map", q],
    enabled: q !== null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!q) throw new Error("no query");
      return unwrap(
        await api.GET("/api/map", {
          params: {
            query: {
              min_lat: q.bbox.minLat,
              min_lng: q.bbox.minLng,
              max_lat: q.bbox.maxLat,
              max_lng: q.bbox.maxLng,
              zoom: q.zoom,
              category: q.category || undefined,
              location: q.location || undefined,
              mode: q.mode,
            },
          },
        }),
      );
    },
  });
}

export function useSubcategories() {
  return useQuery({
    queryKey: ["subcategories"],
    staleTime: Infinity,
    queryFn: async () => unwrap(await api.GET("/api/subcategories")),
  });
}

export function useCities() {
  return useQuery({
    queryKey: ["cities"],
    staleTime: Infinity,
    queryFn: async () => unwrap(await api.GET("/api/cities")),
  });
}
