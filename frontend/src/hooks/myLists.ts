import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "../api/client";
import { retryUnlessClientError } from "./ranking";

export type MyList = Schemas["MyListDetail"];
export type MyListSummary = Schemas["MyListSummary"];

export function useMyLists(enabled = true) {
  return useQuery({
    queryKey: ["myLists"],
    enabled,
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/me/lists")),
  });
}

export function useMyList(id: number) {
  return useQuery({
    queryKey: ["myList", id],
    enabled: Number.isFinite(id),
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/me/lists/{list_id}", { params: { path: { list_id: id } } })),
  });
}

/** Every list mutation returns (or leads to) the fresh list; keep caches in step. */
function useListMutation<V>(id: number, fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      if (res && typeof res === "object" && "items" in res) qc.setQueryData(["myList", id], res);
      else void qc.invalidateQueries({ queryKey: ["myList", id] });
      void qc.invalidateQueries({ queryKey: ["myLists"] });
      void qc.invalidateQueries({ queryKey: ["vote"] });
    },
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; city_slug: string }) =>
      unwrap(await api.POST("/api/me/lists", { body: { ...body, prefill: true } })),
    onSuccess: (res) => {
      qc.setQueryData(["myList", res.id], res);
      void qc.invalidateQueries({ queryKey: ["myLists"] });
    },
  });
}

export function useUpdateList(id: number) {
  return useListMutation(id, async (body: { title?: string; is_open?: boolean; is_public?: boolean }) =>
    unwrap(await api.PATCH("/api/me/lists/{list_id}", { params: { path: { list_id: id } }, body })),
  );
}

export function useAddItems(id: number) {
  return useListMutation(id, async (placeIds: number[]) =>
    unwrap(await api.POST("/api/me/lists/{list_id}/items", { params: { path: { list_id: id } }, body: { place_ids: placeIds } })),
  );
}

export function useRemoveItems(id: number) {
  return useListMutation(id, async (itemIds: number[]) =>
    unwrap(
      await api.POST("/api/me/lists/{list_id}/items/remove", { params: { path: { list_id: id } }, body: { item_ids: itemIds } }),
    ),
  );
}

export function useReorder(id: number) {
  return useListMutation(id, async (itemIds: number[]) =>
    unwrap(await api.PUT("/api/me/lists/{list_id}/order", { params: { path: { list_id: id } }, body: { item_ids: itemIds } })),
  );
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      unwrap(await api.DELETE("/api/me/lists/{list_id}", { params: { path: { list_id: id } } }));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["myLists"] }),
  });
}

export function useSaveListPlaces(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v/{token}/save", { params: { path: { token } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bookmarks"] }),
  });
}

/** "Open in Google Maps" (decided 2026-11-27): a plain search link; no Google account or API. */
export function googleMapsUrl(place: { name: string; city: { name: string } }): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.city.name}`)}`;
}

/** Share a list: the system share sheet on phones, else copy the link. Returns what happened. */
export async function shareList(title: string, url: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
}

/** Lists other people made and chose to show (decided 2026-11-27). */
export function useCommunityLists(city: string) {
  return useQuery({
    queryKey: ["communityLists", city],
    queryFn: async () => unwrap(await api.GET("/api/community-lists", { params: { query: { city } } })),
  });
}
