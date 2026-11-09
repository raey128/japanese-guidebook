import { Stars } from "../components/ranking/StarRating";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";

import Badges from "../components/Badges";
import FlagButton from "../components/FlagButton";
import FlagNoteButton from "../components/FlagNoteButton";
import PinMap from "../components/PinMap";
import PlaceNames from "../components/PlaceNames";
import RankButton from "../components/RankButton";
import MyRankingSummary from "../components/ranking/MyRankingSummary";
import { formatVisit } from "../components/ranking/NoteFields";
import Score from "../components/Score";
import SaveButton from "../components/SaveButton";
import { ApiError } from "../api/client";
import { usePlace, usePlaceNotes } from "../hooks/ranking";
import Loading from "../components/ui/Loading";

export default function PlaceDetail() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const place = usePlace(id);
  const notes = usePlaceNotes(id);
  const data = place.data;

  // A merged place answers with the surviving place: show its id in the URL.
  useEffect(() => {
    if (data && data.id !== id) void navigate(`/places/${data.id}`, { replace: true });
  }, [data, id, navigate]);

  if (place.isPending && Number.isFinite(id)) return <Loading />;
  if (!Number.isFinite(id) || (place.error instanceof ApiError && place.error.status === 404)) {
    return <p role="alert">Place not found</p>;
  }
  if (!data) return <p role="alert">Could not load this place.</p>;

  const v = data.viewer;
  const closed = data.badges.includes("closed") || data.badges.includes("reported_closed");
  const ranked = v.my_ranking != null;
  const listPath = `/lists/${data.city.slug}/${data.subcategory.slug}`;

  return (
    <article className="space-y-4">
      <header className="space-y-1">
        <PlaceNames name={data.name} nameJa={data.name_ja} as="h1" />
        <Badges badges={data.badges} />
        {data.address ? <p>{data.address}</p> : null}
        <p className="text-ink">
          {data.location.is_catch_all ? null : <>{data.location.name}, </>}
          <Link className="link" to={listPath}>
            {data.city.name}
          </Link>{" "}
          ·{" "}
          <Link className="link" to={`${listPath}${data.location.is_catch_all ? "" : `?location=${data.location.slug}`}`}>
            {data.subcategory.name}
          </Link>
        </p>
        <p>
          <Score score={data.public_score} rankerCount={data.ranker_count} />
        </p>
        <p className="hint">Added by {data.creator}</p>
      </header>

      <PinMap lat={data.lat} lng={data.lng} height={200} />

      <div className="flex flex-wrap items-center gap-2">
        {v.signed_in && !v.can_rank && !ranked ? (
          closed ? (
            <p className="btn btn-secondary btn-sm">Reported closed: not accepting new rankings</p>
          ) : null
        ) : (
          <RankButton placeId={data.id} ranked={ranked} />
        )}
        <SaveButton placeId={data.id} isSaved={v.is_bookmarked} source="detail" />
        {v.can_flag ? <FlagButton place={data} /> : null}
        {v.can_edit ? (
          <Link to={`/places/${data.id}/edit`} className="btn btn-secondary btn-sm">
            Edit place
          </Link>
        ) : null}
      </div>

      {v.my_ranking ? <MyRankingSummary ranking={v.my_ranking} /> : null}

      <section aria-labelledby="notes-h">
        <h2 id="notes-h" className="text-lg font-semibold">
          Reviews
        </h2>
        {notes.isPending ? <p role="status">Loading reviews…</p> : null}
        {notes.data && notes.data.notes.length === 0 ? <p className="text-muted">No reviews yet.</p> : null}
        <ul className="divide-y divide-line">
          {notes.data?.notes.map((n) => {
            const visit = formatVisit(n.visit_month, n.visit_year);
            return (
              <li key={n.ranking_id} className="py-3">
                <p className="hint">
                  <strong>{n.author}</strong>
                  {n.rating ? (
                    <>
                      {" · "}
                      <Stars rating={n.rating} />
                    </>
                  ) : null}
                  {visit ? ` · visited ${visit}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{n.note}</p>
                {v.signed_in && !n.is_own ? <FlagNoteButton rankingId={n.ranking_id} /> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
