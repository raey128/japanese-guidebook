import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "../api/client";

export function usePlace(id: number | null) {
  return useQuery({
    queryKey: ["place", id],
    enabled: id !== null && Number.isFinite(id),
    queryFn: async () =>
      unwrap(await api.GET("/api/places/{place_id}", { params: { path: { place_id: id as number } } })),
  });
}

export function useSuggestLocation(pin: { lat: number; lng: number } | null) {
  const lat = pin ? Number(pin.lat.toFixed(5)) : null;
  const lng = pin ? Number(pin.lng.toFixed(5)) : null;
  return useQuery({
    queryKey: ["suggest", lat, lng],
    enabled: lat !== null && lng !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(await api.GET("/api/locations/suggest", { params: { query: { lat: lat as number, lng: lng as number } } })),
  });
}

export function useAddressSearch(q: string) {
  return useQuery({
    queryKey: ["geocodeSearch", q],
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => unwrap(await api.GET("/api/geocode/search", { params: { query: { q: q.trim() } } })),
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = unwrap(await api.GET("/api/geocode/reverse", { params: { query: { lat, lng } } }));
    return res.address ?? null;
  } catch {
    return null;
  }
}

export type PlaceValues = {
  name: string;
  name_ja: string | null;
  lat: number;
  lng: number;
  subcategory_id: number;
  location_id: number;
  address: string | null;
};

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PlaceValues & { confirm_not_duplicate: boolean; source?: "pin" | "manual" }) =>
      unwrap(await api.POST("/api/places", { body: v })),
    onSuccess: (res) => {
      if (res.status === "created") {
        for (const key of ["map", "search", "suggest", "topPicks", "pendingCount"]) void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useUpdatePlace(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PlaceValues): Promise<Schemas["PlaceDetail"]> =>
      unwrap(await api.PATCH("/api/places/{place_id}", { params: { path: { place_id: id } }, body: v })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["place", id] });
      void qc.invalidateQueries({ queryKey: ["map"] });
      void qc.invalidateQueries({ queryKey: ["list"] });
    },
  });
}
