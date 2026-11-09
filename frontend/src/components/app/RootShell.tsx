import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";

import { trackAppOpen } from "../../lib/track";
import { CelebrationProvider } from "./Celebration";
import { InlineSignInProvider } from "./InlineSignIn";
import TabBar, { showsTabBar, TAB_BAR_HEIGHT } from "./TabBar";

/** App-wide providers shared by the full-screen map and the regular pages. */
export default function RootShell() {
  useEffect(() => trackAppOpen(), []);
  const { pathname } = useLocation();
  return (
    <CelebrationProvider>
      <InlineSignInProvider>
        <Outlet />
        {/* Room for the tab bar under scrolling pages (the map handles its own). */}
        {showsTabBar(pathname) && pathname !== "/" ? <div aria-hidden="true" style={{ height: TAB_BAR_HEIGHT }} /> : null}
        <TabBar />
      </InlineSignInProvider>
    </CelebrationProvider>
  );
}
