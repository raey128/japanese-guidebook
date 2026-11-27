import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, ApiError, unwrap, type Schemas } from "../api/client";

export type Photo = Schemas["PhotoOut"];

/** Mirrors the API (R20.2): up to 4 photos per review, 12 MB each. */
export const PHOTOS_PER_REVIEW = 4;
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export function invalidateAfterPhotoChange(qc: QueryClient) {
  for (const key of ["placePhotos", "notes", "place", "myRankings", "feed", "profile"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

export function usePlacePhotos(placeId: number) {
  return useQuery({
    queryKey: ["placePhotos", placeId],
    enabled: Number.isFinite(placeId),
    queryFn: async () =>
      unwrap(await api.GET("/api/places/{place_id}/photos", { params: { path: { place_id: placeId } } })),
  });
}

/**
 * Upload photos to a review. Multipart, so it goes through fetch directly rather than the
 * typed JSON client; errors come back as ApiError like everywhere else.
 */
export async function uploadReviewPhotos(rankingId: number, files: File[]): Promise<Photo[]> {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  const res = await fetch(`${window.location.origin}/api/rankings/${rankingId}/photos`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as Photo[];
}

/** Client-side checks before uploading (the server checks again). */
export function photoProblem(files: File[], alreadyHave: number): string | null {
  if (alreadyHave + files.length > PHOTOS_PER_REVIEW) return `A review can have up to ${PHOTOS_PER_REVIEW} photos.`;
  if (files.some((f) => f.size > PHOTO_MAX_BYTES)) return "Photos can be up to 12 MB.";
  return null;
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: number) => {
      unwrap(await api.DELETE("/api/photos/{photo_id}", { params: { path: { photo_id: photoId } } }));
    },
    onSuccess: () => invalidateAfterPhotoChange(qc),
  });
}

export function useReportPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: number) =>
      unwrap(await api.POST("/api/photos/{photo_id}/report", { params: { path: { photo_id: photoId } } })),
    onSuccess: (res) => {
      if (res.hidden) invalidateAfterPhotoChange(qc);
    },
  });
}

export function useReportedPhotos(enabled: boolean) {
  return useQuery({
    queryKey: ["reportedPhotos"],
    enabled,
    queryFn: async () => unwrap(await api.GET("/api/admin/photos")),
  });
}

export function useModeratePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "hide" | "keep" }) =>
      unwrap(await api.POST("/api/admin/photos/{photo_id}/{action}", { params: { path: { photo_id: id, action } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reportedPhotos"] });
      invalidateAfterPhotoChange(qc);
    },
  });
}
