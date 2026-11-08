import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "../api/client";

export type FlagStatusFilter = "open" | "dismissed" | "resolved" | "all";

/** Mirrors backend PlaceFlagIn (a discriminated union) without depending on generated naming. */
export type PlaceFlagInput =
  | { flag_type: "closed" | "spam"; payload?: null }
  | { flag_type: "wrong_location"; payload: { lat: number; lng: number } }
  | {
      flag_type: "wrong_info";
      payload: { name?: string; name_ja?: string; subcategory_id?: number; location_id?: number };
    }
  | { flag_type: "duplicate"; payload: { other_place_id: number } };

export function useSubcategories() {
  return useQuery({
    queryKey: ["subcategories"],
    queryFn: async () => unwrap(await api.GET("/api/subcategories")),
    staleTime: 5 * 60_000,
  });
}

export function useCities() {
  return useQuery({
    queryKey: ["cities"],
    queryFn: async () => unwrap(await api.GET("/api/cities")),
    staleTime: 5 * 60_000,
  });
}

export function useFlagPlace(placeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PlaceFlagInput) =>
      unwrap(
        await api.POST("/api/places/{place_id}/flags", {
          params: { path: { place_id: placeId } },
          body: body as never,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["place", placeId] });
    },
  });
}

export function useFlagNote(rankingId: number) {
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/rankings/{ranking_id}/flags", {
          params: { path: { ranking_id: rankingId } },
          body: { flag_type: "spam" },
        }),
      ),
  });
}

export function useAdminFlags(status: FlagStatusFilter) {
  return useQuery({
    queryKey: ["adminFlags", status],
    queryFn: async () =>
      unwrap(await api.GET("/api/admin/flags", { params: { query: { status } } })),
    retry: false,
  });
}

function invalidateModeration(qc: QueryClient) {
  for (const key of ["adminFlags", "place", "notes", "map", "search", "list", "seeds"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

export type AdminAction =
  | { kind: "apply"; flagId: number }
  | { kind: "dismiss"; flagId: number }
  | { kind: "hide" | "unhide" | "close" | "reopen"; placeId: number }
  | { kind: "merge"; placeId: number; intoPlaceId: number }
  | { kind: "removeNote"; rankingId: number };

export async function runAdminAction(a: AdminAction): Promise<unknown> {
  switch (a.kind) {
    case "apply":
      return unwrap(
        await api.POST("/api/admin/flags/{flag_id}/apply", {
          params: { path: { flag_id: a.flagId } },
        }),
      );
    case "dismiss":
      return unwrap(
        await api.POST("/api/admin/flags/{flag_id}/dismiss", {
          params: { path: { flag_id: a.flagId } },
        }),
      );
    case "hide":
    case "unhide":
    case "close":
    case "reopen": {
      const path = `/api/admin/places/{place_id}/${a.kind}` as "/api/admin/places/{place_id}/hide";
      return unwrap(await api.POST(path, { params: { path: { place_id: a.placeId } } }));
    }
    case "merge":
      return unwrap(
        await api.POST("/api/admin/places/{place_id}/merge", {
          params: { path: { place_id: a.placeId } },
          body: { into_place_id: a.intoPlaceId },
        }),
      );
    case "removeNote":
      return unwrap(
        await api.POST("/api/admin/notes/{ranking_id}/remove", {
          params: { path: { ranking_id: a.rankingId } },
        }),
      );
  }
}

export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runAdminAction,
    onSuccess: () => invalidateModeration(qc),
  });
}

export function useSeeds(city: string) {
  return useQuery({
    queryKey: ["seeds", city],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/admin/seeds", { params: { query: city ? { city } : {} } }),
      ),
    retry: false,
  });
}

export function useSetSeedReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, reviewed }: { placeId: number; reviewed: boolean }) =>
      unwrap(
        await api.PUT("/api/admin/seeds/{place_id}", {
          params: { path: { place_id: placeId } },
          body: { reviewed },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["seeds"] });
      void qc.invalidateQueries({ queryKey: ["place"] });
    },
  });
}
