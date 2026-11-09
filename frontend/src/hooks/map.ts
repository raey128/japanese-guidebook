import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import type { Bbox } from "../components/map/geo";

export type MapMode = "all" | "mine" | "want_to_go";

export type MapQuery = {
  bbox: Bbox; // already rounded, so it doubles as the cache key
  zoom: number;
  category: string;
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

export function useTopPicks(bbox: Bbox | null, category: string) {
  return useQuery({
    queryKey: ["topPicks", bbox, category],
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!bbox) throw new Error("no bbox");
      return unwrap(
        await api.GET("/api/top-picks", {
          params: {
            query: {
              min_lat: bbox.minLat,
              min_lng: bbox.minLng,
              max_lat: bbox.maxLat,
              max_lng: bbox.maxLng,
              category: category || undefined,
            },
          },
        }),
      );
    },
  });
}

export function useSuggest(q: string, city: string, category: string, bbox: Bbox | null) {
  const term = q.trim();
  return useQuery({
    queryKey: ["suggest", term, city, category, bbox],
    enabled: term.length > 0 && city.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // TanStack Query keys each result by its query, so a slow older response can never
    // overwrite a newer one (N1.4).
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET("/api/suggest", {
          signal,
          params: {
            query: {
              q: term,
              city,
              category: category || undefined,
              min_lat: bbox?.minLat,
              min_lng: bbox?.minLng,
              max_lat: bbox?.maxLat,
              max_lng: bbox?.maxLng,
            },
          },
        }),
      ),
  });
}

export function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: ["pendingCount"],
    enabled,
    staleTime: 0,
    queryFn: async () => unwrap(await api.GET("/api/admin/pending/count")),
  });
}

/** Areas and stations by name from OpenStreetMap (R12.7), nearest to `near` first. */
export function useAreaLookup(q: string, near: { lat: number; lng: number } | null) {
  const term = q.trim();
  const lat = near ? Number(near.lat.toFixed(2)) : undefined;
  const lng = near ? Number(near.lng.toFixed(2)) : undefined;
  return useQuery({
    queryKey: ["areaLookup", term.toLowerCase(), lat, lng],
    enabled: term.length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(await api.GET("/api/geo/areas", { signal, params: { query: { q: term, lat, lng } } })),
  });
}
