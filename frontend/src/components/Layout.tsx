import { Link, NavLink, Outlet } from "react-router";

import { useMe, useSignOut } from "../hooks/auth";

export default function Layout() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const nav = "rounded-xl px-3 py-2 font-bold hover:bg-stone-100 aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-dark";
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        Skip to content
      </a>
      <header className="border-b-2 border-line bg-white">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-3 py-2 text-sm">
          <Link to="/" className="mr-auto text-lg font-extrabold text-brand">
            Japanese Guidebook
          </Link>
          <NavLink to="/" end className={nav}><span aria-hidden="true">🗺️ </span>Map</NavLink>
          <NavLink to="/lists" className={nav}><span aria-hidden="true">📋 </span>Lists</NavLink>
          {me?.user ? (
            <>
              <NavLink to="/settings" className={nav}>Settings</NavLink>
              {me.user.is_admin && <NavLink to="/admin" end className={nav}>Admin</NavLink>}
              <button type="button" className={nav} onClick={() => signOut.mutate()}>
                Sign out {me.user.username}
              </button>
            </>
          ) : (
            <NavLink to="/sign-in" className={nav}>Sign in</NavLink>
          )}
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-3 py-4">
        <Outlet />
      </main>
      <footer className="border-t-2 border-line px-3 py-3 text-center text-xs text-muted">
        User content is licensed{" "}
        <a className="link" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
        Map data and addresses ©{" "}
        <a className="link" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>{" "}
        (ODbL).
      </footer>
    </div>
  );
}
