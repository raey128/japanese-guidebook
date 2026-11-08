"""Flags, auto-actions, admin moderation actions, merging, and seed review.

Handlers commit; everything here only flushes. Errors are `ModerationError`s, which are
HTTPExceptions so routers can let them propagate.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import geography, place_edits, place_views, ranking, scores
from app.config import get_settings
from app.models import Flag, Location, Place, Ranking, Subcategory, User
from app.schemas.common import PlaceSummary
from app.schemas.moderation import (
    FlagGroup,
    FlagOut,
    FlagQueue,
    NoteTarget,
    SeedCityCount,
    SeedItem,
    SeedReview,
)


class ModerationError(HTTPException):
    def __init__(self, status_code: int, detail: str):
        super().__init__(status_code, detail)


# ---- Helpers --------------------------------------------------------------------------------


async def _live_place(db: AsyncSession, place_id: int) -> Place:
    """A place the public can see (not hidden, not merged away); else 404."""
    place = await db.get(Place, place_id)
    if place is None or place.is_hidden or place.merged_into_id is not None:
        raise ModerationError(404, "Place not found.")
    return place


async def _admin_place(db: AsyncSession, place_id: int) -> Place:
    place = await db.get(Place, place_id)
    if place is None:
        raise ModerationError(404, "Place not found.")
    if place.merged_into_id is not None:
        raise ModerationError(409, "This place was merged into another place.")
    return place


async def _close_flags(
    db: AsyncSession,
    *,
    status: str,
    flag_types: tuple[str, ...],
    place_id: int | None = None,
    ranking_id: int | None = None,
) -> None:
    """Move the matching OPEN flags to `status` ('resolved' or 'dismissed')."""
    stmt = update(Flag).where(Flag.status == "open", Flag.flag_type.in_(flag_types))
    if place_id is not None:
        stmt = stmt.where(Flag.target_type == "place", Flag.place_id == place_id)
    if ranking_id is not None:
        stmt = stmt.where(Flag.target_type == "note", Flag.ranking_id == ranking_id)
    await db.execute(stmt.execution_options(synchronize_session="fetch"))
    await db.flush()


async def _summary(db: AsyncSession, place_id: int) -> PlaceSummary:
    return (await place_views.place_summaries(db, [place_id]))[place_id]


# ---- Creating flags -------------------------------------------------------------------------


async def _insert_flag(db: AsyncSession, flag: Flag) -> Flag:
    try:
        async with db.begin_nested():
            db.add(flag)
            await db.flush()
    except IntegrityError as e:
        raise ModerationError(409, "You already flagged this.") from e
    return flag


async def _validate_place_payload(
    db: AsyncSession, place: Place, flag_type: str, payload: dict[str, Any] | None
) -> None:
    if flag_type == "wrong_location":
        assert payload is not None
        distance = (
            await db.execute(
                text(
                    "SELECT ST_Distance(geom::geography, "
                    "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) "
                    "FROM places WHERE id = :id"
                ),
                {"lat": payload["lat"], "lng": payload["lng"], "id": place.id},
            )
        ).scalar_one()
        if distance < 1.0:
            raise ModerationError(422, "The suggested pin is the same as the current pin.")
    elif flag_type == "wrong_info":
        assert payload is not None
        if "subcategory_id" in payload and await db.get(Subcategory, payload["subcategory_id"]) is None:
            raise ModerationError(422, "Unknown subcategory.")
        if "location_id" in payload and await db.get(Location, payload["location_id"]) is None:
            raise ModerationError(422, "Unknown location.")
        unchanged = (
            payload.get("name", place.name) == place.name
            and payload.get("name_ja", place.name_ja or "") == (place.name_ja or "")
            and payload.get("subcategory_id", place.subcategory_id) == place.subcategory_id
            and payload.get("location_id", place.location_id) == place.location_id
        )
        if unchanged:
            raise ModerationError(422, "The suggestion matches the current details.")
    elif flag_type == "duplicate":
        assert payload is not None
        other_id = payload["other_place_id"]
        if other_id == place.id:
            raise ModerationError(422, "A place can't be a duplicate of itself.")
        other = await db.get(Place, other_id)
        if other is None or other.is_hidden or other.merged_into_id is not None:
            raise ModerationError(422, "The other place doesn't exist.")


async def _auto_action(db: AsyncSession, place: Place, flag_type: str) -> str | None:
    """At `flag_threshold` distinct open flaggers: spam hides, closed marks reported-closed."""
    if flag_type not in ("spam", "closed"):
        return None
    flaggers = (
        await db.execute(
            select(func.count(func.distinct(Flag.user_id))).where(
                Flag.target_type == "place",
                Flag.place_id == place.id,
                Flag.flag_type == flag_type,
                Flag.status == "open",
            )
        )
    ).scalar_one()
    if flaggers < get_settings().flag_threshold:
        return None
    if flag_type == "spam" and not place.is_hidden:
        place.is_hidden = True
        await db.flush()
        await scores.refresh_place(db, place.id)
        return "hidden"
    if flag_type == "closed" and not place.is_closed:
        place.is_closed = True
        place.closed_by_reports = True
        await db.flush()
        return "closed"
    return None


async def flag_place(
    db: AsyncSession, user: User, place_id: int, flag_type: str, payload: dict[str, Any] | None
) -> tuple[Flag, str | None]:
    place = await _live_place(db, place_id)
    if place.creator_id == user.id:
        raise ModerationError(403, "You can't flag your own place.")
    await _validate_place_payload(db, place, flag_type, payload)
    flag = await _insert_flag(
        db,
        Flag(
            user_id=user.id,
            target_type="place",
            place_id=place.id,
            flag_type=flag_type,
            payload=payload,
            status="open",
            created_at=datetime.now(UTC),
        ),
    )
    action = await _auto_action(db, place, flag_type)
    return flag, action


async def flag_note(db: AsyncSession, user: User, ranking_id: int, flag_type: str) -> Flag:
    r = await db.get(Ranking, ranking_id)
    if r is None or not (r.note or "").strip():
        raise ModerationError(404, "Note not found.")
    place = await db.get(Place, r.place_id)
    if place is None or place.is_hidden or place.merged_into_id is not None:
        raise ModerationError(404, "Note not found.")
    if r.user_id == user.id:
        raise ModerationError(403, "You can't flag your own note.")
    return await _insert_flag(
        db,
        Flag(
            user_id=user.id,
            target_type="note",
            ranking_id=r.id,
            flag_type=flag_type,
            payload=None,
            status="open",
            created_at=datetime.now(UTC),
        ),
    )


# ---- Admin queue ----------------------------------------------------------------------------


async def flag_queue(db: AsyncSession, status: str) -> FlagQueue:
    stmt = select(Flag).order_by(Flag.created_at.desc(), Flag.id.desc())
    if status != "all":
        stmt = stmt.where(Flag.status == status)
    flags = list(
        (await db.execute(stmt.execution_options(populate_existing=True))).scalars()
    )
    if not flags:
        return FlagQueue(groups=[])

    ranking_ids = {f.ranking_id for f in flags if f.target_type == "note" and f.ranking_id}
    rankings: dict[int, tuple[Ranking, User]] = {}
    if ranking_ids:
        rows = await db.execute(
            select(Ranking, User).join(User, User.id == Ranking.user_id).where(Ranking.id.in_(ranking_ids))
        )
        rankings = {r.id: (r, u) for r, u in rows.all()}

    place_ids: set[int] = set()
    for f in flags:
        if f.target_type == "place" and f.place_id:
            place_ids.add(f.place_id)
        elif f.ranking_id in rankings:
            place_ids.add(rankings[f.ranking_id][0].place_id)
        if f.flag_type == "duplicate" and f.payload:
            place_ids.add(int(f.payload["other_place_id"]))

    ref = await place_views.load_reference(db)
    summaries = await place_views.place_summaries(db, sorted(place_ids), ref)
    flagger_ids = {f.user_id for f in flags}
    flaggers = {
        u.id: u.username
        for u in (await db.execute(select(User).where(User.id.in_(flagger_ids)))).scalars()
    }

    def flag_out(f: Flag) -> FlagOut:
        payload = f.payload or None
        dup = None
        sub = None
        loc = None
        if f.flag_type == "duplicate" and payload:
            dup = summaries.get(int(payload["other_place_id"]))
        if f.flag_type == "wrong_info" and payload:
            if payload.get("subcategory_id") is not None:
                sub = ref.subcategories.get(payload["subcategory_id"])
            if payload.get("location_id") is not None:
                loc = ref.locations.get(payload["location_id"])
        return FlagOut(
            id=f.id,
            flag_type=f.flag_type,
            status=f.status,  # type: ignore[arg-type]
            flagger=flaggers.get(f.user_id, "?"),
            created_at=f.created_at.isoformat(),
            payload=payload,
            duplicate_place=dup,
            suggested_subcategory=sub,
            suggested_location=loc,
        )

    groups: dict[str, FlagGroup] = {}
    for f in flags:  # already newest first, so a group's first flag is its latest
        if f.target_type == "place":
            key = f"place:{f.place_id}"
        else:
            key = f"note:{f.ranking_id}"
        group = groups.get(key)
        if group is None:
            place = None
            note = None
            if f.target_type == "place":
                place = summaries.get(f.place_id)  # type: ignore[arg-type]
            else:
                pair = rankings.get(f.ranking_id)  # type: ignore[arg-type]
                if pair is not None:
                    r, u = pair
                    place = summaries.get(r.place_id)
                    note = NoteTarget(
                        ranking_id=r.id,
                        note=r.note,
                        author=u.username,
                        author_is_private=u.is_private,
                        visit_month=r.visit_month,
                        visit_year=r.visit_year,
                    )
            group = FlagGroup(
                key=key,
                target_type=f.target_type,  # type: ignore[arg-type]
                latest_at=f.created_at.isoformat(),
                counts={},
                place=place,
                note=note,
                flags=[],
            )
            groups[key] = group
        group.counts[f.flag_type] = group.counts.get(f.flag_type, 0) + 1
        group.flags.append(flag_out(f))
    return FlagQueue(groups=list(groups.values()))


# ---- Admin actions on places ----------------------------------------------------------------


async def hide_place(db: AsyncSession, place_id: int) -> PlaceSummary:
    place = await _admin_place(db, place_id)
    place.is_hidden = True
    await db.flush()
    await scores.refresh_place(db, place.id)
    await _close_flags(db, status="resolved", flag_types=("spam",), place_id=place.id)
    return await _summary(db, place.id)


async def unhide_place(db: AsyncSession, place_id: int) -> PlaceSummary:
    place = await _admin_place(db, place_id)
    place.is_hidden = False
    if place.status == "pending":  # unhiding a manual add is the same as approving it
        place.status = "live"
        place.reviewed_at = func.now()
    await db.flush()
    await scores.refresh_place(db, place.id)
    # The admin judged it not spam: don't let the old flags re-trigger the threshold.
    await _close_flags(db, status="dismissed", flag_types=("spam",), place_id=place.id)
    return await _summary(db, place.id)


async def close_place(db: AsyncSession, place_id: int) -> PlaceSummary:
    place = await _admin_place(db, place_id)
    place.is_closed = True
    place.closed_by_reports = False
    await db.flush()
    await _close_flags(db, status="resolved", flag_types=("closed",), place_id=place.id)
    return await _summary(db, place.id)


async def reopen_place(db: AsyncSession, place_id: int) -> PlaceSummary:
    place = await _admin_place(db, place_id)
    place.is_closed = False
    place.closed_by_reports = False
    await db.flush()
    await _close_flags(db, status="dismissed", flag_types=("closed",), place_id=place.id)
    return await _summary(db, place.id)


async def apply_flag(db: AsyncSession, flag_id: int) -> PlaceSummary:
    flag = await db.get(Flag, flag_id)
    if flag is None:
        raise ModerationError(404, "Flag not found.")
    if flag.status != "open":
        raise ModerationError(409, "This flag has already been handled.")
    if flag.target_type != "place" or flag.flag_type not in ("wrong_location", "wrong_info"):
        raise ModerationError(422, "Only wrong location and wrong info flags can be applied.")
    assert flag.place_id is not None
    place = await _admin_place(db, flag.place_id)
    payload = flag.payload or {}
    try:
        if flag.flag_type == "wrong_location":
            suggestion = await geography.suggest_location(db, payload["lat"], payload["lng"])
            if suggestion.outside_coverage:
                raise ModerationError(422, "The suggested pin is outside the covered cities.")
            # A pin moved into another city takes that city's suggested location, so the
            # place (and its rankings, via re-insertion) move to the right Lists.
            new_location_id = None
            if suggestion.city is not None and suggestion.city.id != place.city_id:
                assert suggestion.location is not None
                new_location_id = suggestion.location.id
            await place_edits.apply_place_changes(
                db, place, lat=payload["lat"], lng=payload["lng"], location_id=new_location_id
            )
        else:
            name_ja = payload.get("name_ja")
            await place_edits.apply_place_changes(
                db,
                place,
                name=payload.get("name"),
                name_ja=name_ja if name_ja else None,
                clear_name_ja=name_ja == "",
                subcategory_id=payload.get("subcategory_id"),
                location_id=payload.get("location_id"),
            )
    except place_edits.PlaceEditError as e:
        raise ModerationError(422, str(e)) from e
    flag.status = "resolved"
    await db.flush()
    return await _summary(db, place.id)


async def dismiss_flag(db: AsyncSession, flag_id: int) -> Flag:
    flag = await db.get(Flag, flag_id)
    if flag is None:
        raise ModerationError(404, "Flag not found.")
    if flag.status != "open":
        raise ModerationError(409, "This flag has already been handled.")
    flag.status = "dismissed"
    await db.flush()
    return flag


async def remove_note(db: AsyncSession, ranking_id: int) -> None:
    """Clear the note text (the ranking itself and its visit date stay) and resolve its flags."""
    r = await db.get(Ranking, ranking_id)
    if r is None:
        raise ModerationError(404, "Ranking not found.")
    if r.note is None:
        raise ModerationError(409, "This ranking has no note.")
    r.note = None
    await db.flush()
    await _close_flags(db, status="resolved", flag_types=("spam",), ranking_id=r.id)


# ---- Merge ----------------------------------------------------------------------------------


async def merge_places(db: AsyncSession, source_id: int, into_id: int) -> PlaceSummary:
    """Merge `source` into `target` (R9.5): rankings and bookmarks move, one per user keeping the
    most recently updated ranking, the old place becomes a hidden redirect."""
    source = await db.get(Place, source_id)
    if source is None:
        raise ModerationError(404, "Place not found.")
    if source.merged_into_id is not None:
        raise ModerationError(409, "This place was already merged.")
    if into_id == source.id:
        raise ModerationError(422, "A place can't be merged into itself.")
    target = await db.get(Place, into_id)
    if target is None or target.is_hidden or target.merged_into_id is not None:
        raise ModerationError(422, "Choose a visible place to merge into.")

    categories = {
        (source.city_id, source.subcategory_id),
        (target.city_id, target.subcategory_id),
    }
    source_rankings = list(
        (
            await db.execute(
                select(Ranking).where(Ranking.place_id == source.id).order_by(Ranking.id)
            )
        ).scalars()
    )
    for r in source_rankings:
        categories.add((r.city_id, r.subcategory_id))
        mine = await ranking.get_user_ranking(db, r.user_id, target.id)
        if mine is not None:
            if r.updated_at > mine.updated_at:
                categories.add((mine.city_id, mine.subcategory_id))
                await ranking.delete_ranking(db, mine)
            else:
                await ranking.delete_ranking(db, r)
                continue
        r.place_id = target.id
        await db.flush()
        if (r.city_id, r.subcategory_id) != (target.city_id, target.subcategory_id):
            await ranking.reinsert(db, r, target.city_id, target.subcategory_id)

    # Bookmarks: one per user on the survivor; ranked places aren't want-to-go.
    await db.execute(
        text(
            """
            INSERT INTO bookmarks (user_id, place_id, created_at)
            SELECT user_id, :target, created_at FROM bookmarks WHERE place_id = :source
            ON CONFLICT DO NOTHING
            """
        ),
        {"source": source.id, "target": target.id},
    )
    await db.execute(text("DELETE FROM bookmarks WHERE place_id = :source"), {"source": source.id})
    await db.execute(
        text(
            """
            DELETE FROM bookmarks b USING rankings r
            WHERE b.place_id = :target AND r.place_id = :target AND r.user_id = b.user_id
            """
        ),
        {"target": target.id},
    )

    await _close_flags(
        db,
        status="resolved",
        flag_types=("closed", "wrong_location", "wrong_info", "duplicate", "spam"),
        place_id=source.id,
    )
    source.merged_into_id = target.id
    source.is_hidden = True
    await db.flush()
    await scores.refresh_aggregates(db, [source.id, target.id], categories)
    return await _summary(db, target.id)


# ---- Seed review ----------------------------------------------------------------------------


async def seed_review(db: AsyncSession, city_slug: str | None) -> SeedReview:
    ref = await place_views.load_reference(db)
    city_id = None
    if city_slug is not None:
        match = [c for c in ref.cities.values() if c.slug == city_slug]
        if not match:
            raise ModerationError(404, "City not found.")
        city_id = match[0].id

    count_rows = (
        await db.execute(
            text(
                """
                SELECT city_id, COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE NOT seed_reviewed) AS unreviewed
                FROM places WHERE is_seed AND merged_into_id IS NULL GROUP BY city_id
                """
            )
        )
    ).all()
    by_city = {r.city_id: r for r in count_rows}
    counts = [
        SeedCityCount(
            city=city,
            total=by_city[city.id].total if city.id in by_city else 0,
            unreviewed=by_city[city.id].unreviewed if city.id in by_city else 0,
        )
        for city in sorted(ref.cities.values(), key=lambda c: c.id)
    ]

    stmt = (
        select(Place.id, Place.seed_reviewed)
        .where(Place.is_seed, Place.merged_into_id.is_(None))
        .order_by(Place.city_id, Place.name, Place.id)
    )
    if city_id is not None:
        stmt = stmt.where(Place.city_id == city_id)
    rows = (await db.execute(stmt)).all()
    summaries = await place_views.place_summaries(db, [r.id for r in rows], ref)
    items = [SeedItem(place=summaries[r.id], reviewed=r.seed_reviewed) for r in rows]
    return SeedReview(counts=counts, items=items)


async def set_seed_reviewed(db: AsyncSession, place_id: int, reviewed: bool) -> SeedItem:
    place = await db.get(Place, place_id)
    if place is None or not place.is_seed:
        raise ModerationError(404, "Seed place not found.")
    place.seed_reviewed = reviewed
    await db.flush()
    return SeedItem(place=await _summary(db, place.id), reviewed=reviewed)
