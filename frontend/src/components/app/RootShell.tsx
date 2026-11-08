import { useEffect } from "react";
import { Outlet } from "react-router";

import { trackAppOpen } from "../../lib/track";
import { CelebrationProvider } from "./Celebration";
import { InlineSignInProvider } from "./InlineSignIn";

/** App-wide providers shared by the full-screen map and the regular pages. */
export default function RootShell() {
  useEffect(() => trackAppOpen(), []);
  return (
    <CelebrationProvider>
      <InlineSignInProvider>
        <Outlet />
      </InlineSignInProvider>
    </CelebrationProvider>
  );
}
