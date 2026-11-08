import { NavLink } from "react-router";

import { usePendingCount } from "../hooks/map";

/** Tabs across the admin pages. */
export default function AdminNav() {
  const pending = usePendingCount(true);
  const count = pending.data?.count ?? 0;
  const tab = "chip aria-[current=page]:border-brand-dark aria-[current=page]:bg-brand aria-[current=page]:text-white";
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-2">
      <NavLink to="/admin/pending" className={tab}>
        Pending{count > 0 ? ` · ${count}` : ""}
      </NavLink>
      <NavLink to="/admin" end className={tab}>
        Flags
      </NavLink>
      <NavLink to="/admin/seeds" className={tab}>
        Seeds
      </NavLink>
      <NavLink to="/admin/stats" className={tab}>
        Stats
      </NavLink>
    </nav>
  );
}
