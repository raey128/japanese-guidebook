"""Pairwise ranking (R3.2, R3.3, R4.x): snapshot, write, note edit, delete, my rankings, notes."""

from collections.abc import Iterable
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select, text

from app import ranking as ranking_core
from app import scores
from app.deps import DB, CurrentUser, OptionalUser
from app.models import BUCKETS, Place, Ranking
from app.place_views import load_reference
from app.schemas.common import ANONYMOUS, Message, MyRanking
from app.schemas.rankings import (
    BucketList,
    CategoryLists,
    CityLists,
    MyRankings,
    NotePatch,
    PlaceNote,
    PlaceNotes,
    RankingItem,
    RankRequest,
    RankResponse,
    Snapshot,
    StaleListOut,
)
from app.visibility import can_see, can_use

router = APIRouter(tags=["rankings"])

# Fixed ORDER BY clauses for the notes list (never built from user input).
NOTE_ORDER = {
    "newest": "r.created_at DESC, r.id DESC",
    "highest": "r.rating DESC NULLS LAST, r.created_at DESC, r.id DESC",
    "lowest": "r.rating ASC NULLS LAST, r.created_at DESC, r.id DESC",
}


def _item(r: Ranking, p: Place) -> RankingItem:
    return RankingItem(
        ranking_id=r.id,
        place_id=r.place_id,
        name=p.name,
        name_ja=p.name_ja,
        position=r.position,
        personal_score=r.personal_score,
        rating=r.rating,
        note=r.note,
        visit_month=r.visit_month,
        visit_year=r.visit_year,
        badges=scores.badges(  # type: ignore[arg-type]
            is_unverified=False,
            is_closed=p.is_closed,
            closed_by_reports=p.closed_by_reports,
            is_hidden=p.is_hidden,
            is_pending=p.status == "pending",
        ),
    )


async def _places_by_id(db, place_ids: Iterable[int]) -> dict[int, Place]:  # type: ignore[no-untyped-def]
    ids = sorted(set(place_ids))
    if not ids:
        return {}
    rows = await db.execute(select(Place).where(Place.id.in_(ids)))
    return {p.id: p for p in rows.scalars()}


async def _bucket_list(db, snap: ranking_core.ListSnapshot) -> BucketList:  # type: ignore[no-untyped-def]
    places = await _places_by_id(db, (r.place_id for r in snap.items))
    return BucketList(
        bucket=snap.key.bucket,  # type: ignore[arg-type]
        version=snap.version,
        items=[_item(r, places[r.place_id]) for r in snap.items],
    )


async def _visible_place(db, place_id: int, user_id: int) -> Place:  # type: ignore[no-untyped-def]
    place = await db.get(Place, place_id)
    if place is None or not can_use(place, user_id):
        raise HTTPException(404, "Place not found.")
    return place


@router.get("/rankings/snapshot", response_model=Snapshot, operation_id="getRankingSnapshot")
async def get_snapshot(place_id: int, db: DB, user: CurrentUser) -> Snapshot:
    place = await _visible_place(db, place_id, user.id)
    snaps = await ranking_core.get_snapshot(db, user.id, place.city_id, place.subcategory_id)
    mine = await ranking_core.get_user_ranking(db, user.id, place.id)
    ref = await load_reference(db)
    return Snapshot(
        place_id=place.id,
        city=ref.cities[place.city_id],
        subcategory=ref.subcategories[place.subcategory_id],
        can_rank=mine is not None or not place.is_closed,
        my_ranking=MyRanking.model_validate(mine) if mine else None,
        buckets=[await _bucket_list(db, snaps[b]) for b in BUCKETS],
    )


@router.put(
    "/rankings",
    response_model=RankResponse,
    responses={
        404: {"model": Message},
        409: {"model": StaleListOut, "description": "Stale list_version, or place closed"},
    },
    operation_id="putRanking",
)
async def put_ranking(body: RankRequest, db: DB, user: CurrentUser):  # type: ignore[no-untyped-def]
    place = await _visible_place(db, body.place_id, user.id)
    bucket = ranking_core.bucket_for_rating(body.rating)
    if body.bucket is not None and body.bucket != bucket:
        raise HTTPException(
            422, f"A {body.rating}-star rating belongs in {bucket}, not {body.bucket}."
        )
    existing = await ranking_core.get_user_ranking(db, user.id, place.id)
    if "note" in body.model_fields_set:
        note_after = body.note
    else:
        note_after = existing.note if existing else None
    try:
        ranking_core.check_review(body.rating, note_after)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    previous_bucket = existing.bucket if existing is not None else None
    previous_key = (existing.city_id, existing.subcategory_id) if existing is not None else None
    try:
        ranked = await ranking_core.place_ranking(
            db,
            user_id=user.id,
            place=place,
            bucket=bucket,
            position=body.position,
            expected_version=body.list_version,
        )
        ranked.rating = body.rating
    except ranking_core.StaleListError as e:
        return JSONResponse(
            status_code=409, content={"detail": str(e), "current_version": e.current_version}
        )
    except ranking_core.RankingNotAllowed as e:
        raise HTTPException(409, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e

    fields = body.model_fields_set & {"note", "visit_month", "visit_year"}
    if fields:
        try:
            await ranking_core.update_note(
                db,
                ranked,
                note=body.note if "note" in fields else ranked.note,
                visit_month=body.visit_month if "visit_month" in fields else ranked.visit_month,
                visit_year=body.visit_year if "visit_year" in fields else ranked.visit_year,
            )
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
    await db.commit()

    snaps = await ranking_core.get_snapshot(db, user.id, place.city_id, place.subcategory_id)
    previous_list = None
    if (
        previous_bucket is not None
        and previous_bucket != bucket
        and previous_key == (place.city_id, place.subcategory_id)
    ):
        previous_list = await _bucket_list(db, snaps[previous_bucket])
    # For the celebration message (R16.5): "That's your 7th place in Tokyo!"
    city_count = (
        await db.execute(
            text(
                "SELECT count(*) FROM rankings r JOIN places p ON p.id = r.place_id "
                "WHERE r.user_id = :u AND p.city_id = :c"
            ),
            {"u": user.id, "c": place.city_id},
        )
    ).scalar_one()
    ref = await load_reference(db)
    return RankResponse(
        rank_list=await _bucket_list(db, snaps[bucket]),
        previous_list=previous_list,
        ranking=MyRanking.model_validate(ranked),
        is_new=existing is None,
        city_name=ref.cities[place.city_id].name,
        city_rank_count=city_count,
    )


async def _own_ranking(db, ranking_id: int, user) -> Ranking:  # type: ignore[no-untyped-def]
    ranking = await db.get(Ranking, ranking_id)
    if ranking is None:
        raise HTTPException(404, "Ranking not found.")
    if ranking.user_id != user.id:
        raise HTTPException(403, "You can only change your own rankings.")
    return ranking


@router.patch(
    "/rankings/{ranking_id}",
    response_model=MyRanking,
    responses={403: {"model": Message}, 404: {"model": Message}},
    operation_id="updateRankingNote",
)
async def patch_ranking(ranking_id: int, body: NotePatch, db: DB, user: CurrentUser) -> MyRanking:
    ranking = await _own_ranking(db, ranking_id, user)
    sent = body.model_fields_set
    try:
        await ranking_core.update_note(
            db,
            ranking,
            note=body.note if "note" in sent else ranking.note,
            visit_month=body.visit_month if "visit_month" in sent else ranking.visit_month,
            visit_year=body.visit_year if "visit_year" in sent else ranking.visit_year,
        )
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    await db.commit()
    return MyRanking.model_validate(ranking)


@router.delete(
    "/rankings/{ranking_id}",
    status_code=204,
    responses={403: {"model": Message}, 404: {"model": Message}},
    operation_id="deleteRanking",
)
async def delete_ranking(ranking_id: int, db: DB, user: CurrentUser) -> Response:
    ranking = await _own_ranking(db, ranking_id, user)
    await ranking_core.delete_ranking(db, ranking)
    await db.commit()
    return Response(status_code=204)


@router.get("/me/rankings", response_model=MyRankings, operation_id="getMyRankings")
async def my_rankings(db: DB, user: CurrentUser) -> MyRankings:
    rows = (
        await db.execute(
            select(Ranking, Place)
            .join(Place, Place.id == Ranking.place_id)
            .where(Ranking.user_id == user.id)
            .order_by(Ranking.position, Ranking.id)
        )
    ).all()
    versions = {
        (r.city_id, r.subcategory_id, r.bucket): r.version
        for r in (
            await db.execute(
                text(
                    "SELECT city_id, subcategory_id, bucket, version FROM rank_lists "
                    "WHERE user_id = :u"
                ),
                {"u": user.id},
            )
        )
    }
    grouped: dict[tuple[int, int], dict[str, list[RankingItem]]] = {}
    for r, p in rows:
        grouped.setdefault((r.city_id, r.subcategory_id), {b: [] for b in BUCKETS})[
            r.bucket
        ].append(_item(r, p))

    ref = await load_reference(db)
    by_city: dict[int, list[CategoryLists]] = {}
    for (city_id, sub_id), buckets in sorted(
        grouped.items(),
        key=lambda kv: (ref.cities[kv[0][0]].name, ref.subcategories[kv[0][1]].name),
    ):
        by_city.setdefault(city_id, []).append(
            CategoryLists(
                subcategory=ref.subcategories[sub_id],
                buckets=[
                    BucketList(
                        bucket=b,  # type: ignore[arg-type]
                        version=versions.get((city_id, sub_id, b), 0),
                        items=buckets[b],
                    )
                    for b in BUCKETS
                ],
            )
        )
    cities = sorted(by_city, key=lambda cid: ref.cities[cid].name)
    return MyRankings(
        cities=[CityLists(city=ref.cities[cid], categories=by_city[cid]) for cid in cities]
    )


@router.get(
    "/places/{place_id}/notes",
    response_model=PlaceNotes,
    responses={404: {"model": Message}, 308: {"description": "Merged: redirects"}},
    operation_id="getPlaceNotes",
)
async def place_notes(
    place_id: int,
    db: DB,
    viewer: OptionalUser,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort: Literal["newest", "highest", "lowest"] = "newest",
):  # type: ignore[no-untyped-def]
    """Reviews with a comment. `sort`: newest first (default), or by star rating, highest or
    lowest first (unrated ones last, newest first within a rating)."""
    place = await db.get(Place, place_id)
    if place is None or not can_see(place, viewer):
        raise HTTPException(404, "Place not found.")
    if place.merged_into_id is not None:
        return RedirectResponse(f"/api/places/{place.merged_into_id}/notes", status_code=308)
    rows = await db.execute(
        text(
            f"""
            SELECT r.id, r.user_id, r.note, r.visit_month, r.visit_year, r.bucket, r.rating,
                   r.created_at, u.username, u.is_private
            FROM rankings r JOIN users u ON u.id = r.user_id
            WHERE r.place_id = :pid AND r.note IS NOT NULL AND btrim(r.note) <> ''
            ORDER BY {NOTE_ORDER[sort]}
            LIMIT :limit OFFSET :offset
            """
        ),
        {"pid": place_id, "limit": limit, "offset": offset},
    )
    return PlaceNotes(
        notes=[
            PlaceNote(
                ranking_id=r.id,
                author=ANONYMOUS if r.is_private else r.username,
                note=r.note,
                visit_month=r.visit_month,
                visit_year=r.visit_year,
                bucket=r.bucket,
                rating=r.rating,
                created_at=r.created_at.isoformat(),
                is_own=viewer is not None and viewer.id == r.user_id,
            )
            for r in rows
        ]
    )
