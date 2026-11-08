import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";

import Layout from "./components/Layout";

/** One lazily loaded module per page; each page file default-exports its component. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, lazy: page(() => import("./pages/Home")) },
      { path: "sign-in", lazy: page(() => import("./pages/SignIn")) },
      { path: "map", lazy: page(() => import("./pages/MapPage")) },
      { path: "places/new", lazy: page(() => import("./pages/AddPlace")) },
      { path: "places/:id", lazy: page(() => import("./pages/PlaceDetail")) },
      { path: "places/:id/edit", lazy: page(() => import("./pages/EditPlace")) },
      { path: "places/:id/rank", lazy: page(() => import("./pages/RankFlow")) },
      { path: "lists/:city/:category", lazy: page(() => import("./pages/RankedList")) },
      { path: "search", lazy: page(() => import("./pages/Search")) },
      { path: "me/rankings", lazy: page(() => import("./pages/MyRankings")) },
      { path: "me/want-to-go", lazy: page(() => import("./pages/WantToGo")) },
      { path: "settings", lazy: page(() => import("./pages/Settings")) },
      { path: "u/:username", lazy: page(() => import("./pages/Profile")) },
      { path: "admin", lazy: page(() => import("./pages/AdminQueue")) },
      { path: "admin/seeds", lazy: page(() => import("./pages/SeedReview")) },
      { path: "*", lazy: page(() => import("./pages/NotFound")) },
    ],
  },
]);
