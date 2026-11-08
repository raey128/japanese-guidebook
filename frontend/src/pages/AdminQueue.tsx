import { useState } from "react";
import { Link } from "react-router";

import { ApiError } from "../api/client";
import FlagGroupCard from "../components/moderation/FlagGroupCard";
import { useAdminFlags, type FlagStatusFilter } from "../hooks/moderation";
import AdminNav from "../components/AdminNav";

const TABS: { value: FlagStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export default function AdminQueue() {
  const [status, setStatus] = useState<FlagStatusFilter>("open");
  const q = useAdminFlags(status);
  const err = q.error instanceof ApiError ? q.error : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-extrabold">Moderation queue</h1>
        <Link to="/admin/seeds" className="link">
          Review seed places
        </Link>
      </div>
      <div className="mb-4">
        <AdminNav />
      </div>

      {err?.status === 401 ? (
        <p role="alert">
          Please <Link to="/sign-in?next=/admin" className="link">sign in</Link> to continue.
        </p>
      ) : err?.status === 403 ? (
        <p role="alert">Admins only.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Flag status" className="mb-3 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={status === t.value}
                onClick={() => setStatus(t.value)}
                className={`chip ${status === t.value ? "border-brand-dark bg-brand text-white" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-live="polite">
            {q.isPending && <p>Loading…</p>}
            {q.error && !err && <p role="alert">Couldn't load the queue.</p>}
            {err && err.status !== 401 && err.status !== 403 && <p role="alert">Couldn't load the queue.</p>}
            {q.data && q.data.groups.length === 0 && <p>Nothing here.</p>}
            {q.data && (
              <ul className="space-y-3">
                {q.data.groups.map((g) => (
                  <FlagGroupCard key={g.key} group={g} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
