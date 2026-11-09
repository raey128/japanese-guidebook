import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { COPY } from "../../copy";
import { useMe, useSignOut } from "../../hooks/auth";
import { usePendingCount } from "../../hooks/map";
import LicenceNotice from "../LicenceNotice";
import { Legend } from "./CategoryChips";

/** Navigation behind a menu button over the map (R11.2). Admins see a pending-review dot (R13.9). */
export default function MenuDrawer() {
  const [open, setOpen] = useState(false);
  const me = useMe();
  const user = me.data?.user ?? null;
  const signOut = useSignOut();
  const pending = usePendingCount(Boolean(user?.is_admin));
  const count = pending.data?.count ?? 0;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void pending.refetch();
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const item = "flex min-h-12 items-center gap-3 rounded-xl px-3 font-extrabold hover:bg-stone-100";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={count > 0 ? `Menu, ${count} places waiting for review` : "Menu"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-icon relative size-14 shrink-0 shadow-lg"
      >
        <span aria-hidden="true" className="text-xl">
          ⚙️
        </span>
        {count > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-white bg-brand" /> : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={close}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            className="flex h-full w-80 max-w-[85vw] flex-col gap-1 overflow-y-auto border-r-2 border-line bg-white p-4"
          >
            <div className="flex items-center justify-between pb-2">
              <p className="text-xl font-extrabold text-brand">{COPY.appName}</p>
              <button type="button" onClick={close} aria-label="Close menu" className="btn btn-ghost btn-icon btn-sm text-xl">
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {user ? <p className="px-3 pb-2 hint">Signed in as {user.username}</p> : null}
            <Link to="/lists" className={item}>
              <span aria-hidden="true">🏆</span> Lists
            </Link>
            {user ? (
              <>
                <Link to="/me/submissions" className={item}>
                  <span aria-hidden="true">📮</span> My submissions
                </Link>
                <Link to="/settings" className={item}>
                  <span aria-hidden="true">⚙️</span> Settings
                </Link>
              </>
            ) : null}
            {user?.is_admin ? (
              <>
                <Link to="/admin/pending" className={item}>
                  <span aria-hidden="true">🛡️</span> Admin{count > 0 ? ` · ${count} pending` : ""}
                </Link>
                <Link to="/admin" className={item}>
                  <span aria-hidden="true">🚩</span> Flags
                </Link>
                <Link to="/admin/stats" className={item}>
                  <span aria-hidden="true">📊</span> Stats
                </Link>
              </>
            ) : null}
            {user ? (
              <button type="button" className={item} onClick={() => signOut.mutate()}>
                <span aria-hidden="true">👋</span> Sign out {user.username}
              </button>
            ) : (
              <Link to="/sign-in" className={item}>
                <span aria-hidden="true">👋</span> Sign in
              </Link>
            )}
            <div className="mt-4 border-t-2 border-line pt-4">
              <p className="pb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Map key</p>
              <Legend />
            </div>
            <div className="mt-auto pt-4">
              <LicenceNotice />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
