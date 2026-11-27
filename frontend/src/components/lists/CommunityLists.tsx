import { useState } from "react";
import { Link } from "react-router";

import { useCities } from "../../hooks/lists";
import { useCommunityLists } from "../../hooks/myLists";
import { getLastCity } from "../../lib/lastCity";
import Chip from "../ui/Chip";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Loading from "../ui/Loading";
import ListCover from "./ListCover";

/** Lists other people made and chose to show, as big poster cards (decided 2026-11-27). */
export default function CommunityLists({ onNew }: { onNew: () => void }) {
  const cities = useCities();
  const [city, setCity] = useState(getLastCity());
  const q = useCommunityLists(city);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="City" className="flex flex-wrap gap-2">
        {(cities.data ?? []).map((c) => (
          <Chip key={c.id} pressed={c.slug === city} onClick={() => setCity(c.slug)}>
            {c.name}
          </Chip>
        ))}
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          emoji="🗺️"
          title="No lists here yet."
          action={
            <button type="button" className="btn btn-primary" onClick={onNew}>
              Make the first one
            </button>
          }
        >
          Make a list and switch on “Show on Community lists” to share it with everyone.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {q.data.map((l) => (
            <li key={l.id}>
              <Link to={`/l/${l.token}`} className="card block overflow-hidden p-2 hover:shadow-lg">
                <ListCover cover={l.cover} id={l.id} className="h-36 w-full text-4xl" />
                <span className="block px-1 pt-2 font-display text-xl font-black leading-tight">{l.title}</span>
                <span className="block px-1 text-sm font-bold text-muted">
                  by {l.owner} · {l.place_count} {l.place_count === 1 ? "place" : "places"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
