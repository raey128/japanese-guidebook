import { Link } from "react-router";

import { useMyLists } from "../../hooks/myLists";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Loading from "../ui/Loading";
import ListCover from "./ListCover";

/** Your shared lists as poster cards (decided 2026-11-27). */
export default function MySharedLists({ onNew }: { onNew: () => void }) {
  const q = useMyLists();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (q.data.length === 0) {
    return (
      <EmptyState
        emoji="📋"
        title="No lists yet."
        action={
          <button type="button" className="btn btn-primary" onClick={onNew}>
            Make your first list
          </button>
        }
      >
        Pick places, send one link, and friends tap yes, maybe or no.
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {q.data.map((l) => (
        <li key={l.id}>
          <Link to={`/lists/mine/${l.id}`} className="card flex items-center gap-3 p-2 hover:bg-stone-50">
            <ListCover cover={l.cover} id={l.id} className="size-20 text-2xl" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-lg font-black">{l.title}</span>
              <span className="block text-sm font-bold text-muted">
                {l.place_count} {l.place_count === 1 ? "place" : "places"} · {l.city.name}
              </span>
              <span className="block text-sm text-muted">
                {l.is_open ? `${l.voter_count} ${l.voter_count === 1 ? "person has" : "people have"} voted` : "Voting off"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
