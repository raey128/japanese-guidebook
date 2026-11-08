import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import { retryUnlessClientError } from "./ranking";

export const TOP_CATEGORIES = [
  { slug: "food", name: "Food" },
  { slug: "sights", name: "Sights" },
  { slug: "stays", name: "Stays" },
  { slug: "experiences", name: "Experiences" },
];

export function useCities() {
  return useQuery({
    queryKey: ["cities"],
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await api.GET("/api/cities")),
  });
}

export function useSubcategories() {
  return useQuery({
    queryKey: ["subcategories"],
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await api.GET("/api/subcategories")),
  });
}

const PAGE = 50;

export function usePublicList(city: string, category: string, location: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["list", city, category, location ?? ""],
    retry: retryUnlessClientError,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/api/lists/{city_slug}/{category}", {
          params: {
            path: { city_slug: city, category },
            query: { location: location || undefined, limit: PAGE, offset: pageParam },
          },
        }),
      ),
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
  });
}

export interface SearchParams {
  q: string;
  city: string;
  location: string;
  category: string;
}

export function useSearchPlaces(p: SearchParams) {
  const q = p.q.trim();
  return useQuery({
    queryKey: ["search", { ...p, q }],
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/search", {
          params: { query: { q, city: p.city || undefined, location: p.location || undefined, category: p.category || undefined } },
        }),
      ),
  });
}

export function useBookmarks(enabled = true) {
  return useQuery({
    queryKey: ["bookmarks"],
    enabled,
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/me/bookmarks")),
  });
}
