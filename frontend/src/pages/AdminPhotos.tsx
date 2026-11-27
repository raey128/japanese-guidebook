import { Link, Navigate } from "react-router";

import AdminNav from "../components/AdminNav";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import Loading from "../components/ui/Loading";
import { useMe } from "../hooks/auth";
import { useDeletePhoto, useModeratePhoto, useReportedPhotos } from "../hooks/photos";

/** Reported photos (R20.6): hide, keep (clears the reports) or delete for good. */
export default function AdminPhotos() {
  const me = useMe();
  const isAdmin = Boolean(me.data?.user?.is_admin);
  const q = useReportedPhotos(isAdmin);
  const moderate = useModeratePhoto();
  const del = useDeletePhoto();

  if (me.isPending) return <Loading />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Reported photos</h1>
      <AdminNav />
      {q.isPending ? <Loading /> : null}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : null}
      {q.data && q.data.length === 0 ? <EmptyState emoji="📷" title="No reported photos." /> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {q.data?.map((p) => (
          <li key={p.id} className="card space-y-2 p-3">
            <a href={p.url} target="_blank" rel="noreferrer">
              <img src={p.thumb_url} alt={`Reported photo by ${p.author}`} className="h-48 w-full rounded-xl object-cover" />
            </a>
            <p className="text-sm">
              By <strong>{p.author}</strong> on{" "}
              <Link className="link" to={`/?place=${p.place_id}`}>
                {p.place_name}
              </Link>
            </p>
            <p className="text-sm">
              <span className="badge bg-warning-soft text-warning-ink">{p.report_count} reports</span>{" "}
              {p.is_hidden ? <span className="badge bg-stone-100 text-ink">Hidden</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: p.id, action: "keep" })}>
                Keep (clear reports)
              </button>
              {!p.is_hidden ? (
                <button type="button" className="btn btn-secondary btn-sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: p.id, action: "hide" })}>
                  Hide
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm("Delete this photo for good?")) del.mutate(p.id, { onSuccess: () => void q.refetch() });
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
