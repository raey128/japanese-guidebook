import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import { COPY } from "../copy";
import { track } from "../lib/track";
import { useInlineSignIn } from "./app/InlineSignIn";
import { BookmarkIcon } from "./ui/icons";

/** Save ♡ (R17.1): bookmarks a place. Signed out → inline username panel, then saves (R17.3). */
export default function SaveButton({
  placeId,
  isSaved,
  source,
  size = "sm",
  icon = false,
}: {
  placeId: number;
  isSaved: boolean;
  source?: "pin" | "top_pick" | "search" | "list" | "detail";
  size?: "sm" | "md";
  /** A bookmark icon instead of the labelled button (the place card, R17.1). */
  icon?: boolean;
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
  if (icon) {
    return (
      <button
        type="button"
        aria-pressed={isSaved}
        aria-label={isSaved ? COPY.saved : COPY.save}
        title={isSaved ? "Saved to your list" : "Save to your list"}
        onClick={() => requireUser(() => toggle.mutate(!isSaved))}
        disabled={toggle.isPending}
        className={`btn btn-sm btn-icon size-10 ${isSaved ? "btn-primary" : "btn-secondary"}`}
      >
        <BookmarkIcon filled={isSaved} />
      </button>
    );
  }
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
