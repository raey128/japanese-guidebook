import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { api, unwrap, type Schemas } from "../api/client";
import AdminNav from "../components/AdminNav";
import PinMap from "../components/PinMap";
import Button, { ButtonLink } from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import Loading from "../components/ui/Loading";
import { useMe } from "../hooks/auth";

function PendingCard({ item }: { item: Schemas["PendingPlace"] }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const done = () => {
    for (const key of ["pendingQueue", "pendingCount", "map", "topPicks", "suggest"]) void qc.invalidateQueries({ queryKey: [key] });
  };
  const approve = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/api/admin/pending/{place_id}/approve", { params: { path: { place_id: item.place.id } } })),
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/admin/pending/{place_id}/reject", {
          params: { path: { place_id: item.place.id } },
          body: { reason: reason.trim() || null },
        }),
      ),
    onSuccess: done,
  });
  const p = item.place;
  return (
    <li className="card space-y-3" aria-label={`Pending: ${p.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">{p.name}</h2>
          {p.name_ja ? <p lang="ja" className="hint">{p.name_ja}</p> : null}
          <p className="hint">
            {p.subcategory.name} · {p.location.name}, {p.city.name} · by {item.submitter} ·{" "}
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
        <Link to={`/places/${p.id}`} className="link text-sm">
          Open
        </Link>
      </div>
      <PinMap lat={p.lat} lng={p.lng} />
      <div>
        <p className="text-sm font-extrabold">Live places within 200 m</p>
        {item.nearby.length === 0 ? (
          <p className="hint">None. Probably not a duplicate.</p>
        ) : (
          <ul className="text-sm">
            {item.nearby.map((n) => (
              <li key={n.id}>
                <Link to={`/places/${n.id}`} className="link">
                  {n.name}
                </Link>{" "}
                <span className="text-muted">({n.subcategory.name})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {approve.isError || reject.isError ? <ErrorState message={(approve.error ?? reject.error)?.message} /> : null}
      {rejecting ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate();
          }}
        >
          <label htmlFor={`reason-${p.id}`} className="label">
            Reason (optional, shown to the submitter)
          </label>
          <input id={`reason-${p.id}`} className="field" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={reject.isPending}>
              Reject
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="success" disabled={approve.isPending} onClick={() => approve.mutate()}>
            Approve
          </Button>
          <ButtonLink variant="secondary" to={`/places/${p.id}/edit`}>
            Edit first
          </ButtonLink>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            Reject…
          </Button>
        </div>
      )}
    </li>
  );
}

/** Admin queue of manual adds waiting for review, oldest first (R13.4). */
export default function AdminPending() {
  const me = useMe();
  const isAdmin = Boolean(me.data?.user?.is_admin);
  const q = useQuery({
    queryKey: ["pendingQueue"],
    enabled: isAdmin,
    queryFn: async () => unwrap(await api.GET("/api/admin/pending")),
  });
  if (me.isPending) return <Loading />;
  if (!isAdmin) return <p role="alert">Admins only.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Pending places</h1>
      <AdminNav />
      {q.isPending ? <Loading /> : null}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.items.length === 0 ? <EmptyState emoji="🎉" title="All caught up! Nothing waiting for review." /> : null}
      {q.data && q.data.items.length > 0 ? (
        <ul className="space-y-4">
          {q.data.items.map((item) => (
            <PendingCard key={item.place.id} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
