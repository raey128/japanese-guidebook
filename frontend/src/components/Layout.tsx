import { Link, NavLink, Outlet } from "react-router";

import { useMe, useSignOut } from "../hooks/auth";

export default function Layout() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const nav = "rounded px-2 py-1 hover:bg-stone-100 aria-[current=page]:font-semibold";
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
        Skip to content
      </a>
      <header className="border-b border-stone-200">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-3 py-2 text-sm">
          <Link to="/" className="mr-auto font-bold text-brand">
            Japanese Guidebook
          </Link>
          <NavLink to="/map" className={nav}>Map</NavLink>
          <NavLink to="/search" className={nav}>Search</NavLink>
          {me?.user ? (
            <>
              <NavLink to="/me/rankings" className={nav}>My rankings</NavLink>
              <NavLink to="/me/want-to-go" className={nav}>Want to go</NavLink>
              <NavLink to="/settings" className={nav}>Settings</NavLink>
              {me.user.is_admin && <NavLink to="/admin" className={nav}>Admin</NavLink>}
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
      <footer className="border-t border-stone-200 px-3 py-3 text-center text-xs text-stone-700">
        User content is licensed{" "}
        <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
        Map data and addresses ©{" "}
        <a className="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>{" "}
        (ODbL).
      </footer>
    </div>
  );
}
