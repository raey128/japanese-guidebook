
import { ApiError } from "../../api/client";
import { usePublicList } from "../../hooks/lists";
import PlaceRow from "../ranking/PlaceRow";
import { ButtonLink } from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import { COPY } from "../../copy";
import Loading from "../ui/Loading";

/** A public ranked list (R5.2) for one city + category: title, empty state, rows and paging. */
export default function PublicListView({
  city,
  category,
  location,
  headingLevel = 1,
  showOnMap = false,
}: {
  city: string;
  category: string;
  location?: string;
  headingLevel?: 1 | 2;
  showOnMap?: boolean;
}) {
  const list = usePublicList(city, category, location || undefined);

  if (list.isPending) return <Loading />;
  if (list.error instanceof ApiError && list.error.status === 404) return <p role="alert">List not found</p>;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  const pages = list.data.pages;
  const first = pages[0]!;
  const items = pages.flatMap((p) => p.items);
  const search = new URLSearchParams({ city, category });
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className="space-y-4">
      <Heading className={headingLevel === 1 ? "text-3xl font-extrabold" : "text-xl font-bold"}>{first.title}</Heading>

      {items.every((p) => p.ranker_count === 0) ? (
        <EmptyState
          emoji="🌱"
          title={COPY.emptyRanked}
          action={
            <span className="flex flex-wrap justify-center gap-2">
              <ButtonLink to={`/search?${search.toString()}`}>Rank a place</ButtonLink>
              <ButtonLink variant="secondary" to="/?add=1">
                {COPY.addPlace}
              </ButtonLink>
            </span>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <ol>
          {items.map((p) => (
            <PlaceRow key={p.id} place={p} rank={p.rank} showOnMap={showOnMap} />
          ))}
        </ol>
      ) : null}

      {list.hasNextPage ? (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className="btn btn-secondary"
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
      <p className="hint" aria-live="polite">
        Showing {items.length} of {first.total}
      </p>
    </div>
  );
}
