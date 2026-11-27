"""Review photos (R20): loading them for places, reviews, feeds and profiles."""

from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import media
from app.schemas.photos import PhotoOut

PHOTO_SQL = """
SELECT ph.id, ph.ranking_id, ph.key, ph.width, ph.height, ph.created_at, ph.user_id,
       u.username
FROM photos ph JOIN users u ON u.id = ph.user_id
"""


def photo_out(row, viewer_id: int | None) -> PhotoOut:  # type: ignore[no-untyped-def]
    return PhotoOut(
        id=row.id,
        ranking_id=row.ranking_id,
        url=media.url(row.key) or "",
        thumb_url=media.url(row.key, thumb=True) or "",
        width=row.width,
        height=row.height,
        author=row.username,
        author_avatar_url=None,  # avatars are parked with the rest of the social work
        created_at=row.created_at.isoformat(),
        is_own=viewer_id is not None and viewer_id == row.user_id,
    )


async def photos_for_rankings(
    db: AsyncSession, ranking_ids: Iterable[int], viewer_id: int | None, *, include_hidden=False
) -> dict[int, list[PhotoOut]]:
    """Visible photos per ranking, oldest first (the order they were added)."""
    ids = sorted(set(ranking_ids))
    out: dict[int, list[PhotoOut]] = defaultdict(list)
    if not ids:
        return out
    hidden = "" if include_hidden else "AND NOT ph.is_hidden"
    rows = await db.execute(
        text(f"{PHOTO_SQL} WHERE ph.ranking_id = ANY(:ids) {hidden} ORDER BY ph.id"),
        {"ids": ids},
    )
    for r in rows:
        out[r.ranking_id].append(photo_out(r, viewer_id))
    return out


async def photos_for_place(
    db: AsyncSession, place_id: int, viewer_id: int | None, limit: int = 30
) -> list[PhotoOut]:
    rows = await db.execute(
        text(
            f"""{PHOTO_SQL}
            JOIN rankings r ON r.id = ph.ranking_id
            WHERE r.place_id = :pid AND NOT ph.is_hidden
            ORDER BY ph.created_at DESC, ph.id DESC
            LIMIT :limit"""
        ),
        {"pid": place_id, "limit": limit},
    )
    return [photo_out(r, viewer_id) for r in rows]
