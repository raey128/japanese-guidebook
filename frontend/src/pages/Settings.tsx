import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router";

import { api, unwrap, type Schemas } from "../api/client";
import WantToGoList from "../components/lists/WantToGoList";
import MyRankingSummary from "../components/ranking/MyRankingSummary";
import PlaceNames from "../components/PlaceNames";
import { ButtonLink } from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import Loading from "../components/ui/Loading";
import { useMe, useSignOut } from "../hooks/auth";
import { useMyRankings } from "../hooks/ranking";

type Item = Schemas["RankingItem"];
type Review = { item: Item; bucket: Schemas["MyRanking"]["bucket"]; city: string; category: string };

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "reviews", label: "My reviews" },
  { id: "saved", label: "Saved" },
  { id: "added", label: "Places I added" },
];

/** Every rating the user made, newest list order kept, flattened for editing. */
function flatten(data: Schemas["MyRankings"] | undefined): Review[] {
  const out: Review[] = [];
  for (const c of data?.cities ?? []) {
    for (const cat of c.categories) {
      for (const b of cat.buckets) {
        for (const item of b.items) out.push({ item, bucket: b.bucket, city: c.city.name, category: cat.subcategory.name });
      }
    }
  }
  return out;
}

function MyReviews() {
  const q = useMyRankings();
  const reviews = flatten(q.data);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (reviews.length === 0) {
    return (
      <EmptyState emoji="⭐" title="No reviews yet." action={<ButtonLink to="/">Find a place to rate</ButtonLink>}>
        Rate places you've been to and they show up here.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {reviews.map(({ item, bucket, city, category }) => (
        <li key={item.ranking_id}>
          <MyRankingSummary
            headingId={`review-${item.ranking_id}`}
            heading={
              <span className="flex flex-wrap items-baseline gap-x-2">
                <Link to={`/?place=${item.place_id}`} className="hover:underline">
                  <PlaceNames name={item.name} nameJa={item.name_ja} as="span" />
                </Link>
                <span className="text-sm font-bold text-muted">
                  {category} · {city}
                </span>
              </span>
            }
            ranking={{
              id: item.ranking_id,
              bucket,
              position: item.position,
              personal_score: item.personal_score,
              rating: item.rating ?? null,
              note: item.note ?? null,
              visit_month: item.visit_month ?? null,
              visit_year: item.visit_year ?? null,
            }}
          />
          <Link to={`/places/${item.place_id}/rank`} className="link ml-1 mt-1 inline-block text-sm">
            Re-rate {item.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PlacesIAdded() {
  const q = useQuery({
    queryKey: ["submissions", "all"],
    queryFn: async () => unwrap(await api.GET("/api/me/submissions", { params: { query: { all: true } } })),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  const items = q.data.items;
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="hint">Places you add show up here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.place_id} className="card flex flex-wrap items-center gap-3 p-3">
              {s.status === "rejected" ? (
                <span className="min-w-0 flex-1 font-extrabold">{s.name}</span>
              ) : (
                <Link to={`/?place=${s.place_id}`} className="min-w-0 flex-1 font-extrabold hover:underline">
                  {s.name}
                </Link>
              )}
              {s.status !== "live" ? (
                <span className="badge bg-warning-soft text-warning-ink">{s.status === "pending" ? "Waiting for review" : "Not approved"}</span>
              ) : null}
              {/* Editing is open for 24 hours after adding (R2.x); after that, Flag fixes it. */}
              {s.status !== "rejected" && Date.now() - new Date(s.created_at).getTime() < 24 * 3600 * 1000 ? (
                <Link to={`/places/${s.place_id}/edit`} className="btn btn-secondary btn-sm">
                  Edit<span className="sr-only"> {s.name}</span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Link to="/me/submissions" className="link text-sm">
        Manual adds and their review status
      </Link>
    </div>
  );
}

/**
 * Settings (R19): account info and privacy, every review you wrote (edit the comment, re-rate or
 * delete), the places you saved (remove them) and the places you added.
 */
export default function Settings() {
  const me = useMe();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const update = useMutation({
    mutationFn: async (isPrivate: boolean) => unwrap(await api.PATCH("/api/me", { body: { is_private: isPrivate } })),
    onSuccess: () => {
      for (const key of ["me", "profile", "place", "notes"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });

  if (me.isPending) return <Loading />;
  const user = me.data?.user;
  if (!user) return <Navigate to="/sign-in?next=%2Fsettings" replace />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold">Settings</h1>
      <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="chip">
            {s.label}
          </a>
        ))}
      </nav>

      <section id="account" aria-labelledby="account-h" className="card space-y-3">
        <h2 id="account-h" className="text-xl font-extrabold">
          Account
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-bold text-muted">Username</dt>
          <dd className="font-extrabold">{user.username}</dd>
          <dt className="font-bold text-muted">Profile</dt>
          <dd>{user.is_private ? "Private" : "Public"}</dd>
          {user.is_admin ? (
            <>
              <dt className="font-bold text-muted">Role</dt>
              <dd>Admin</dd>
            </>
          ) : null}
        </dl>
        <label className="flex items-center gap-2 font-bold">
          <input
            type="checkbox"
            checked={user.is_private}
            disabled={update.isPending}
            onChange={(e) => update.mutate(e.target.checked)}
            className="size-5"
          />
          Make my profile private
        </label>
        <p className="hint">
          When private, your reviews and the places you add show as Anonymous and your profile page is hidden. Your ratings
          still count toward public scores.
        </p>
        <p role="status" aria-live="polite" className="text-sm">
          {update.isPending ? "Saving…" : update.isError ? `Could not save: ${update.error.message}` : update.isSuccess ? "Saved" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {!user.is_private ? (
            <ButtonLink variant="secondary" size="sm" to={`/u/${user.username}`}>
              View my public profile
            </ButtonLink>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut.mutate()}>
            Sign out
          </button>
        </div>
      </section>

      <section id="reviews" aria-labelledby="reviews-h" className="space-y-3">
        <h2 id="reviews-h" className="text-xl font-extrabold">
          My reviews
        </h2>
        <MyReviews />
      </section>

      <section id="saved" aria-labelledby="saved-h" className="space-y-3">
        <h2 id="saved-h" className="text-xl font-extrabold">
          Saved places
        </h2>
        <WantToGoList />
      </section>

      <section id="added" aria-labelledby="added-h" className="space-y-3">
        <h2 id="added-h" className="text-xl font-extrabold">
          Places I added
        </h2>
        <PlacesIAdded />
      </section>
    </div>
  );
}
