import { NavLink, useLocation } from "react-router";

/** Height of the bar, so the map can keep its floating controls above it. */
export const TAB_BAR_HEIGHT = "4.5rem";

/** Paths that show the tab bar: the two main tabs (R11.2, R14.6). */
export function showsTabBar(pathname: string): boolean {
  return pathname === "/" || pathname === "/lists" || pathname.startsWith("/lists/");
}

const TABS = [
  { to: "/", label: "Map", emoji: "🗺️", end: true },
  { to: "/lists", label: "Lists", emoji: "📋", end: false },
];

/**
 * The app's two main tabs, always at the bottom of the screen: Map (first) and Lists (second),
 * so lists are one tap away from anywhere on either (R14.6).
 */
export default function TabBar() {
  const { pathname } = useLocation();
  if (!showsTabBar(pathname)) return null;
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-2" style={{ height: TAB_BAR_HEIGHT }}>
        {TABS.map((t) => (
          <li key={t.to} className="flex">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-0.5 text-sm font-extrabold transition-colors ${
                  isActive ? "text-brand-dark" : "text-muted hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-16 items-center justify-center rounded-full text-2xl ${isActive ? "bg-brand-soft" : ""}`}
                  >
                    {t.emoji}
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
