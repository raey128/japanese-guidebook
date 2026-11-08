import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { api, ApiError, unwrap, type Schemas } from "../api/client";
import Badges from "../components/Badges";
import PlaceNames from "../components/PlaceNames";
import { retryUnlessClientError } from "../hooks/ranking";

const LABEL = { liked: "Liked", fine: "Fine", disliked: "Disliked" } as const;

export default function Profile() {
  const { username = "" } = useParams();
  const profile = useQuery({
    queryKey: ["profile", username],
    retry: retryUnlessClientError,
    queryFn: async () => unwrap(await api.GET("/api/users/{username}", { params: { path: { username } } })),
  });

  if (profile.isPending) return <p role="status">Loading…</p>;
  if (profile.error instanceof ApiError && profile.error.status === 404) return <p role="alert">Not found</p>;
  if (profile.isError) return <p role="alert">Could not load this profile.</p>;

  const data = profile.data;
  const byCity = new Map<number, { city: Schemas["CityOut"]; lists: Schemas["ProfileList"][] }>();
  for (const l of data.lists) {
    const g = byCity.get(l.city.id) ?? { city: l.city, lists: [] };
    g.lists.push(l);
    byCity.set(l.city.id, g);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{data.username}</h1>
      <p className="text-sm text-stone-700">Member since {new Date(data.created_at).toLocaleDateString()}</p>
      {data.is_self ? (
        <p>
          This is your public profile. <Link className="underline" to="/settings">Privacy settings</Link>
        </p>
      ) : null}
      {data.lists.length === 0 ? <p>No rankings yet.</p> : null}
      {[...byCity.values()].map((g) => (
        <section key={g.city.id} className="space-y-3">
          <h2 className="text-xl font-bold">{g.city.name}</h2>
          {g.lists.map((l) => (
            <div key={l.subcategory.id}>
              <h3 className="text-lg font-semibold">{l.subcategory.name}</h3>
              <ol className="divide-y divide-stone-300">
                {l.items.map((it, i) => (
                  <li key={it.place.id} className="flex flex-wrap items-center gap-x-3 py-2">
                    <span className="w-6 text-right font-bold">{i + 1}</span>
                    <Link className="min-w-0 flex-1 hover:underline" to={`/places/${it.place.id}`}>
                      <PlaceNames name={it.place.name} nameJa={it.place.name_ja} as="span" />
                    </Link>
                    <span className="text-sm text-stone-700">{LABEL[it.bucket]}</span>
                    <span className="text-sm text-stone-800">{it.personal_score.toFixed(1)}</span>
                    <Badges badges={it.place.badges} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
