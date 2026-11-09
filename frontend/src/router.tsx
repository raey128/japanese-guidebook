import type { ComponentType } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router";

import RootShell from "./components/app/RootShell";
import Layout from "./components/Layout";

/** One lazily loaded module per page; each page file default-exports its component. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

/** Redirect to `to`, keeping the current query string (R11.1: /map → /, R3.5: /search → /). */
function KeepQuery({ to, rename, set }: { to: string; rename?: Record<string, string>; set?: Record<string, string> }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(set ?? {})) params.set(k, v);
  for (const [from, into] of Object.entries(rename ?? {})) {
    const v = params.get(from);
    params.delete(from);
    if (v) params.set(into, v);
  }
  const qs = params.toString();
  return <Navigate to={{ pathname: to, search: qs ? `?${qs}` : "" }} replace />;
}

export const router = createBrowserRouter([
  {
    Component: RootShell,
    children: [
      // The first screen is always the full-screen map (R11.1), outside the page layout.
      { path: "/", lazy: page(() => import("./pages/MapPage")) },
      { path: "/map", element: <KeepQuery to="/" /> },
      { path: "/search", element: <KeepQuery to="/" /> },
      // Adding a place happens on the map itself (R13.7); old links open the add panel there.
      { path: "/places/new", element: <KeepQuery to="/" set={{ add: "1", z: "17" }} /> },
      {
        Component: Layout,
        children: [
          { path: "/sign-in", lazy: page(() => import("./pages/SignIn")) },
          { path: "/places/:id", lazy: page(() => import("./pages/PlaceDetail")) },
          { path: "/places/:id/edit", lazy: page(() => import("./pages/EditPlace")) },
          { path: "/places/:id/rank", lazy: page(() => import("./pages/RankFlow")) },
          { path: "/lists", lazy: page(() => import("./pages/Lists")) },
          { path: "/lists/:city/:category", lazy: page(() => import("./pages/RankedList")) },
          { path: "/me/rankings", element: <Navigate to="/lists?tab=mine" replace /> },
          { path: "/me/want-to-go", element: <Navigate to="/lists?tab=want_to_go" replace /> },
          { path: "/me/submissions", lazy: page(() => import("./pages/MySubmissions")) },
          { path: "/settings", lazy: page(() => import("./pages/Settings")) },
          { path: "/u/:username", lazy: page(() => import("./pages/Profile")) },
          { path: "/admin", lazy: page(() => import("./pages/AdminQueue")) },
          { path: "/admin/pending", lazy: page(() => import("./pages/AdminPending")) },
          { path: "/admin/seeds", lazy: page(() => import("./pages/SeedReview")) },
          { path: "/admin/stats", lazy: page(() => import("./pages/AdminStats")) },
          { path: "*", lazy: page(() => import("./pages/NotFound")) },
        ],
      },
    ],
  },
]);
