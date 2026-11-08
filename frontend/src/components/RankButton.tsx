import { Link, useLocation } from "react-router";

import { useMe } from "../hooks/auth";

export default function RankButton({ placeId, ranked }: { placeId: number; ranked: boolean }) {
  const me = useMe();
  const loc = useLocation();
  const target = `/places/${placeId}/rank`;
  const to = me.data?.user ? target : `/sign-in?next=${encodeURIComponent(target)}`;
  return (
    <Link to={to} className="inline-block rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark">
      {ranked ? "Re-rank" : "Rank"}
    </Link>
  );
}
