import { Link, useSearchParams } from "react-router";

import type { Schemas } from "../../api/client";
import { useCities, useFeaturedLists } from "../../hooks/lists";
import { topCategoryInfo } from "../../lib/categories";
import { getLastCity, setLastCity } from "../../lib/lastCity";
import Badges from "../Badges";
import PlaceNames from "../PlaceNames";
import Score from "../Score";
import Chip from "../ui/Chip";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Loading from "../ui/Loading";

type Featured = Schemas["FeaturedList"];

function emojiFor(list: Featured): string {
  if (list.kind === "all") return "🏆";
  return topCategoryInfo(list.top_category)?.emoji ?? "📋";
}

/** One list on the Lists tab: its top places, and "See all" for the full ranked list. */
function ListCard({ list, city }: { list: Featured; city: string }) {
  const info = topCategoryInfo(list.top_category);
  const headingId = `list-${list.key}`;
  return (
    <section aria-labelledby={headingId} className="card space-y-2 p-0">
      <div
        className="flex items-center justify-between gap-2 rounded-t-[calc(var(--radius-card)-2px)] px-4 py-3"
        style={{ background: info ? `color-mix(in srgb, ${info.color} 12%, white)` : "var(--color-brand-soft)" }}
      >
        <h2 id={headingId} className="text-lg font-extrabold">
          <span aria-hidden="true">{emojiFor(list)} </span>
          {list.title}
        </h2>
        <Link to={`/lists/${city}/${list.key}`} className="link shrink-0 text-sm">
          See all {list.total}
          <span className="sr-only">: {list.title}</span>
        </Link>
      </div>
      <ol className="px-4 pb-3">
        {list.items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-b-2 border-line py-2 last:border-b-0">
            <span className="w-6 text-right text-lg font-extrabold text-brand">
              <span aria-hidden="true">{p.rank ?? "·"}</span>
              <span className="sr-only">{p.rank ? `Rank ${p.rank}` : "Not ranked yet"}</span>
            </span>
            <div className="min-w-0 flex-1">
              <Link to={`/?place=${p.id}`} className="font-bold underline-offset-2 hover:underline">
                <PlaceNames name={p.name} nameJa={p.name_ja} as="span" />
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Score score={p.public_score} rankerCount={p.ranker_count} />
                <Badges badges={p.badges} />
                <span className="hint">
                  {list.kind === "sub" ? "" : `${p.subcategory.name} · `}
                  {p.location.is_catch_all ? p.city.name : p.location.name}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {list.ranked === 0 ? (
        <p className="px-4 pb-3 text-sm text-muted">Nobody has rated these yet. Rate one you've been to and it'll lead the list!</p>
      ) : null}
    </section>
  );
}

/**
 * The Lists tab (R14.7): ready-made rankings for a city, "Top rated in Tokyo", then each
 * category ("Top Food in Tokyo") and the busiest kinds ("Top Ramen in Tokyo"). The city is in
 * the URL (`city`) so it's linkable.
 */
export default function AllLists() {
  const [sp, setSp] = useSearchParams();
  const cities = useCities();
  const cityList = Array.isArray(cities.data) ? cities.data : [];
  const city = sp.get("city") || getLastCity();
  const featured = useFeaturedLists(city);

  const chooseCity = (slug: string) => {
    setLastCity(slug);
    const next = new URLSearchParams(sp);
    next.set("city", slug);
    setSp(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div role="group" aria-label="City" className="flex gap-2 overflow-x-auto pb-1">
        {cityList.map((c) => (
          <Chip key={c.id} pressed={c.slug === city} onClick={() => chooseCity(c.slug)}>
            {c.name}
          </Chip>
        ))}
      </div>
      {featured.isPending ? <Loading /> : null}
      {featured.isError ? <ErrorState onRetry={() => void featured.refetch()} /> : null}
      {featured.data && featured.data.lists.length === 0 ? (
        <EmptyState emoji="🌱" title={`No places in ${featured.data.city.name} yet.`} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {featured.data?.lists.map((l) => <ListCard key={l.key} list={l} city={city} />)}
      </div>
    </div>
  );
}
