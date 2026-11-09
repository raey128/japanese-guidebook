import { useNavigate } from "react-router";

import { useInlineSignIn } from "./app/InlineSignIn";

/** "Rate": opens the rating flow; signed out → inline username panel first (R17.3). */
export default function RankButton({ placeId, ranked, className = "" }: { placeId: number; ranked: boolean; className?: string }) {
  const navigate = useNavigate();
  const { requireUser } = useInlineSignIn();
  return (
    <button
      type="button"
      className={`btn btn-primary btn-sm ${className}`}
      onClick={() => requireUser(() => void navigate(`/places/${placeId}/rank`), "Pick a username to rate places")}
    >
      <span aria-hidden="true">⭐</span> {ranked ? "Re-rate" : "Rate"}
    </button>
  );
}
