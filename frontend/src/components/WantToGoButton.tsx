import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router";

import { api, unwrap } from "../api/client";
import { useMe } from "../hooks/auth";

export default function WantToGoButton({ placeId, isBookmarked }: { placeId: number; isBookmarked: boolean }) {
  const qc = useQueryClient();
  const me = useMe();
  const navigate = useNavigate();
  const loc = useLocation();
  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const params = { params: { path: { place_id: placeId } } };
      return next ? unwrap(await api.PUT("/api/bookmarks/{place_id}", params)) : unwrap(await api.DELETE("/api/bookmarks/{place_id}", params));
    },
    onSuccess: () => {
      for (const key of ["place", "bookmarks", "map", "search"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
  const onClick = () => {
    if (!me.data?.user) {
      void navigate(`/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`);
      return;
    }
    toggle.mutate(!isBookmarked);
  };
  return (
    <button
      type="button"
      aria-pressed={isBookmarked}
      onClick={onClick}
      disabled={toggle.isPending}
      className={`rounded border px-3 py-2 text-sm font-medium ${isBookmarked ? "border-brand bg-red-50 text-brand-dark" : "border-stone-400 text-stone-800"}`}
    >
      <span aria-hidden="true">{isBookmarked ? "★" : "☆"}</span> Want to go
    </button>
  );
}
