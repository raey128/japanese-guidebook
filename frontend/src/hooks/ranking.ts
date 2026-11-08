import { type QueryClient, useQuery } from "@tanstack/react-query";

import { api, ApiError, unwrap } from "../api/client";

export const retryUnlessClientError = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status < 500) && count < 2;

export function usePlace(id: number) {
  return useQuery({
    queryKey: ["place", id],
    enabled: Number.isFinite(id),
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/places/{place_id}", { params: { path: { place_id: id } } })),
  });
}

export function usePlaceNotes(id: number) {
  return useQuery({
    queryKey: ["notes", id],
    enabled: Number.isFinite(id),
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/places/{place_id}/notes", { params: { path: { place_id: id } } })),
  });
}

export function useSnapshot(placeId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["snapshot", placeId],
    enabled: enabled && Number.isFinite(placeId),
    retry: retryUnlessClientError,
    staleTime: 0,
    refetchOnWindowFocus: false,
    gcTime: 0,
    queryFn: async () =>
      unwrap(await api.GET("/api/rankings/snapshot", { params: { query: { place_id: placeId } } })),
  });
}

export function useMyRankings(enabled = true) {
  return useQuery({
    queryKey: ["myRankings"],
    enabled,
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/me/rankings")),
  });
}

/** Everything that can show a ranking, score or list position goes stale after a ranking change. */
export function invalidateAfterRankingChange(qc: QueryClient) {
  for (const key of ["myRankings", "place", "notes", "snapshot", "bookmarks", "list", "search", "map", "profile"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}
