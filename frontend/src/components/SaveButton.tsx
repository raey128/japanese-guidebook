import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import { COPY } from "../copy";
import { track } from "../lib/track";
import { useInlineSignIn } from "./app/InlineSignIn";

/** Save ♡ (R17.1): bookmarks a place. Signed out → inline username panel, then saves (R17.3). */
export default function SaveButton({
  placeId,
  isSaved,
  source,
  size = "sm",
}: {
  placeId: number;
  isSaved: boolean;
  source?: "pin" | "top_pick" | "search" | "list" | "detail";
  size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const { requireUser } = useInlineSignIn();
  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const params = { params: { path: { place_id: placeId } } };
      return next
        ? unwrap(await api.PUT("/api/bookmarks/{place_id}", params))
        : unwrap(await api.DELETE("/api/bookmarks/{place_id}", params));
    },
    onSuccess: (_d, next) => {
      if (next) track("save", source);
      for (const key of ["place", "bookmarks", "map", "search", "suggest"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
  return (
    <button
      type="button"
      aria-pressed={isSaved}
      onClick={() => requireUser(() => toggle.mutate(!isSaved))}
      disabled={toggle.isPending}
      className={`btn ${size === "sm" ? "btn-sm" : ""} ${isSaved ? "btn-primary" : "btn-secondary"}`}
    >
      <span aria-hidden="true">{isSaved ? "♥" : "♡"}</span> {isSaved ? COPY.saved : COPY.save}
    </button>
  );
}
