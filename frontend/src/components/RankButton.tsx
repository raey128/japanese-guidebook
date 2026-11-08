import { useNavigate } from "react-router";

import { useInlineSignIn } from "./app/InlineSignIn";

/** Opens the ranking flow; signed out → inline username panel first (R17.3). */
export default function RankButton({ placeId, ranked }: { placeId: number; ranked: boolean }) {
  const navigate = useNavigate();
  const { requireUser } = useInlineSignIn();
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => requireUser(() => void navigate(`/places/${placeId}/rank`), "Pick a username to rank places")}
    >
      {ranked ? "Re-rank" : "Rank"}
    </button>
  );
}
