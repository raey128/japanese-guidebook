import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";

import { api, unwrap } from "../api/client";
import { ButtonLink } from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import Loading from "../components/ui/Loading";
import { useMe } from "../hooks/auth";

const STATUS = {
  pending: { label: "Pending review", emoji: "⏳", cls: "bg-warning-soft text-warning-ink" },
  live: { label: "Approved", emoji: "✅", cls: "bg-success-soft text-success-dark" },
  rejected: { label: "Not added", emoji: "🙅", cls: "bg-red-50 text-danger" },
} as const;

/** The places a user added manually and what happened to them (R13.7). */
export default function MySubmissions() {
  const me = useMe();
  const signedIn = Boolean(me.data?.user);
  const q = useQuery({
    queryKey: ["submissions"],
    enabled: signedIn,
    queryFn: async () => unwrap(await api.GET("/api/me/submissions")),
  });
  if (me.isPending) return <Loading />;
  if (!signedIn) return <Navigate to="/sign-in?next=%2Fme%2Fsubmissions" replace />;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">My submissions</h1>
      <p className="hint">Places you added with “Add manually”. We check each one before it goes on the map for everyone.</p>
      {q.isPending ? <Loading /> : null}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.items.length === 0 ? (
        <EmptyState emoji="📮" title="Nothing submitted yet." action={<ButtonLink to="/">Explore the map</ButtonLink>}>
          Can't find a place in search? Use “Add manually” and it shows up here.
        </EmptyState>
      ) : null}
      {q.data && q.data.items.length > 0 ? (
        <ul className="space-y-2">
          {q.data.items.map((s) => {
            const st = STATUS[s.status];
            return (
              <li key={s.place_id} className="card flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  {s.status === "rejected" ? (
                    <p className="font-extrabold">{s.name}</p>
                  ) : (
                    <Link to={`/?place=${s.place_id}`} className="font-extrabold hover:underline">
                      {s.name}
                    </Link>
                  )}
                  <p className="text-xs text-muted">Sent {new Date(s.created_at).toLocaleDateString()}</p>
                  {s.status === "rejected" && s.review_reason ? <p className="text-sm">Reason: {s.review_reason}</p> : null}
                </div>
                <span className={`badge text-sm ${st.cls}`}>
                  <span aria-hidden="true">{st.emoji}</span> {st.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
