"""Building PlaceSummary / PlaceDetail responses. Reused by lists, search, map pins, profiles."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app import media, scores
from app.config import get_settings
from app.models import Bookmark, Place, Ranking, Subcategory, User
from app.schemas.common import (
    ANONYMOUS,
    CityOut,
    LocationOut,
    MyRanking,
    PlaceDetail,
    PlaceImage,
    PlaceSummary,
    SubcategoryOut,
    TopNote,
    ViewerState,
)
from app.visibility import can_use


@dataclass
class Reference:
    subcategories: dict[int, SubcategoryOut]
    locations: dict[int, LocationOut]
    cities: dict[int, CityOut]


async def load_reference(db: AsyncSession) -> Reference:
    """All subcategories, locations and cities (small curated tables)."""
    subs = {
        s.id: SubcategoryOut.model_validate(s)
        for s in (await db.execute(select(Subcategory))).scalars()
    }
    loc_rows = await db.execute(
        text(
            "SELECT id, slug, name, name_ja, city_id, is_catch_all, "
            "ST_Y(centroid) AS lat, ST_X(centroid) AS lng FROM locations"
        )
    )
    locs = {r.id: LocationOut.model_validate(r._mapping) for r in loc_rows}
    city_rows = await db.execute(
        text(
            "SELECT id, slug, name, name_ja, country_code, "
            "ST_Y(centroid) AS lat, ST_X(centroid) AS lng FROM cities"
        )
    )
    cities = {r.id: CityOut.model_validate(r._mapping) for r in city_rows}
    return Reference(subs, locs, cities)


# The place's picture: the newest visible user photo, else its Wikimedia photo (if found).
IMAGE_COLS = (
    "uph.key AS photo_key, wi.image_url AS wiki_url, wi.thumb_url AS wiki_thumb, "
    "wi.author AS wiki_author, wi.license AS wiki_license, wi.page_url AS wiki_page, "
    "tn.note AS peek_note, tn.username AS peek_author, tn.is_private AS peek_private"
)
IMAGE_JOIN = """
LEFT JOIN LATERAL (
    SELECT ph.key FROM photos ph JOIN rankings rk ON rk.id = ph.ranking_id
    WHERE rk.place_id = p.id AND NOT ph.is_hidden
    ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1
) uph ON true
LEFT JOIN place_images wi ON wi.place_id = p.id AND wi.image_url IS NOT NULL
LEFT JOIN LATERAL (
    SELECT rn.note, un.username, un.is_private
    FROM rankings rn JOIN users un ON un.id = rn.user_id
    WHERE rn.place_id = p.id AND rn.note IS NOT NULL AND btrim(rn.note) <> ''
    ORDER BY (rn.bucket = 'liked') DESC, rn.updated_at DESC NULLS LAST, rn.id DESC
    LIMIT 1
) tn ON true
"""

SUMMARY_SQL = f"""
WITH {scores.place_scores_cte()}
SELECT p.id, p.name, p.name_ja, p.address, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng,
       p.subcategory_id, p.location_id, p.city_id, p.is_hidden, p.is_closed,
       p.closed_by_reports, p.status, s.public_score, s.ranker_count, s.is_unverified,
       {IMAGE_COLS}
FROM places p JOIN place_scores s ON s.place_id = p.id
{IMAGE_JOIN}
WHERE p.id = ANY(:ids)
"""


def image_from_row(row: Any) -> PlaceImage | None:
    key = getattr(row, "photo_key", None)
    if key:
        return PlaceImage(
            source="user",
            url=media.url(key) or "",
            thumb_url=media.url(key, thumb=True) or "",
            credit=None,
            credit_url=None,
        )
    wiki = getattr(row, "wiki_url", None)
    if wiki:
        return PlaceImage(
            source="wikimedia",
            url=wiki,
            thumb_url=row.wiki_thumb or wiki,
            credit=f"Photo: {row.wiki_author} · {row.wiki_license}",
            credit_url=row.wiki_page,
        )
    return None


def summary_from_row(row: Any, ref: Reference) -> PlaceSummary:
    """Build a PlaceSummary from a row with the SUMMARY_SQL columns."""
    return PlaceSummary(
        id=row.id,
        name=row.name,
        name_ja=row.name_ja,
        lat=row.lat,
        lng=row.lng,
        address=row.address,
        subcategory=ref.subcategories[row.subcategory_id],
        location=ref.locations[row.location_id],
        city=ref.cities[row.city_id],
        public_score=None if row.public_score is None else round(row.public_score, 2),
        ranker_count=row.ranker_count,
        badges=scores.badges(  # type: ignore[arg-type]
            is_unverified=row.is_unverified,
            is_closed=row.is_closed,
            closed_by_reports=row.closed_by_reports,
            is_hidden=row.is_hidden,
            is_pending=row.status == "pending",
        ),
        image=image_from_row(row),
        peek=(
            TopNote(
                author=ANONYMOUS if row.peek_private else row.peek_author,
                note=row.peek_note.strip()[:200],
            )
            if getattr(row, "peek_note", None)
            else None
        ),
    )


async def place_summaries(
    db: AsyncSession, ids: Sequence[int], ref: Reference | None = None
) -> dict[int, PlaceSummary]:
    """Summaries keyed by id (callers keep their own ordering and hidden filtering)."""
    if not ids:
        return {}
    ref = ref or await load_reference(db)
    rows = (await db.execute(text(SUMMARY_SQL), {"ids": list(ids), **scores.score_params()})).all()
    return {row.id: summary_from_row(row, ref) for row in rows}


def edit_deadline(place: Place):  # type: ignore[no-untyped-def]
    return place.created_at + timedelta(hours=get_settings().edit_window_hours)


def can_edit(user: User | None, place: Place, *, now) -> bool:  # type: ignore[no-untyped-def]
    """Creator within the edit window, or any admin (R2.8)."""
    if user is None:
        return False
    if user.is_admin:
        return True
    return user.id == place.creator_id and now < edit_deadline(place)


async def place_detail(db: AsyncSession, place: Place, viewer: User | None) -> PlaceDetail:
    from sqlalchemy import func

    now = (await db.execute(select(func.now()))).scalar_one()
    summary = (await place_summaries(db, [place.id]))[place.id]
    creator = await db.get(User, place.creator_id)
    assert creator is not None
    creator_name = ANONYMOUS if creator.is_private else creator.username

    my_ranking = None
    bookmarked = False
    if viewer is not None:
        r = (
            await db.execute(
                select(Ranking).where(Ranking.user_id == viewer.id, Ranking.place_id == place.id)
            )
        ).scalar_one_or_none()
        my_ranking = MyRanking.model_validate(r) if r else None
        if my_ranking is not None:
            from app.photos import photos_for_rankings

            my_ranking.photos = (await photos_for_rankings(db, [my_ranking.id], viewer.id))[
                my_ranking.id
            ]
        bookmarked = (
            await db.execute(
                select(Bookmark).where(Bookmark.user_id == viewer.id, Bookmark.place_id == place.id)
            )
        ).first() is not None

    within_window = now < edit_deadline(place)
    top_note = await _top_note(db, place.id)
    return PlaceDetail(
        **summary.model_dump(),
        creator=creator_name,
        created_at=place.created_at.isoformat(),
        is_seed=place.is_seed,
        edit_deadline=edit_deadline(place).isoformat() if within_window else None,
        status=place.status,  # type: ignore[arg-type]
        top_note=top_note,
        viewer=ViewerState(
            signed_in=viewer is not None,
            can_edit=can_edit(viewer, place, now=now),
            can_flag=viewer is not None and viewer.id != place.creator_id,
            can_rank=viewer is not None
            and can_use(place, viewer.id)
            and (my_ranking is not None or not place.is_closed),
            is_bookmarked=bookmarked,
            my_ranking=my_ranking,
        ),
    )


async def _top_note(db: AsyncSession, place_id: int) -> TopNote | None:
    """Most recent non-empty note on a "Liked" ranking.

    Moderators remove notes by clearing them."""
    row = (
        await db.execute(
            text(
                """
                SELECT r.note, u.username, u.is_private
                FROM rankings r JOIN users u ON u.id = r.user_id
                WHERE r.place_id = :p AND r.bucket = 'liked'
                  AND r.note IS NOT NULL AND btrim(r.note) <> ''
                ORDER BY r.updated_at DESC NULLS LAST, r.id DESC
                LIMIT 1
                """
            ),
            {"p": place_id},
        )
    ).first()
    if row is None:
        return None
    return TopNote(author=ANONYMOUS if row.is_private else row.username, note=row.note)
