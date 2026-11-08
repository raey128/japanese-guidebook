import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";

import { api, unwrap } from "../api/client";
import { useMe } from "../hooks/auth";

export default function Settings() {
  const me = useMe();
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (isPrivate: boolean) => unwrap(await api.PATCH("/api/me", { body: { is_private: isPrivate } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["place"] });
      void qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  if (me.isPending) return <p role="status">Loading…</p>;
  const user = me.data?.user;
  if (!user) return <Navigate to="/sign-in?next=%2Fsettings" replace />;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div>
        <label className="flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            checked={user.is_private}
            disabled={update.isPending}
            onChange={(e) => update.mutate(e.target.checked)}
            className="size-5"
          />
          Make my profile private
        </label>
        <p className="mt-1 text-stone-800">
          When private, your notes and the places you add show as Anonymous and your profile page is hidden. Your
          rankings still count toward public scores.
        </p>
      </div>
      <p role="status" aria-live="polite" className="text-sm">
        {update.isPending ? "Saving…" : update.isError ? `Could not save: ${update.error.message}` : update.isSuccess ? "Saved" : ""}
      </p>
      <p>
        <Link className="underline" to={`/u/${user.username}`}>
          View my public profile
        </Link>
      </p>
      <p className="flex gap-4">
        <Link className="underline" to="/me/rankings">
          My rankings
        </Link>
        <Link className="underline" to="/me/want-to-go">
          Want to go
        </Link>
      </p>
    </div>
  );
}
