"""Want-to-go bookmarks (R7)."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app import place_views
from app.deps import DB, CurrentUser
from app.models import Place
from app.schemas.bookmarks import BookmarkList, BookmarkState
from app.visibility import can_use

router = APIRouter(tags=["bookmarks"])


@router.put("/bookmarks/{place_id}", response_model=BookmarkState, operation_id="addBookmark")
async def add_bookmark(place_id: int, db: DB, user: CurrentUser) -> BookmarkState:
    place = await db.get(Place, place_id)
    if place is None or not can_use(place, user.id):
        raise HTTPException(404, "Place not found.")
    await db.execute(
        text(
            "INSERT INTO bookmarks (user_id, place_id, created_at) "
            "VALUES (:u, :p, clock_timestamp()) ON CONFLICT DO NOTHING"
        ),
        {"u": user.id, "p": place_id},
    )
    await db.commit()
    return BookmarkState(place_id=place_id, is_bookmarked=True)


@router.delete("/bookmarks/{place_id}", response_model=BookmarkState, operation_id="removeBookmark")
async def remove_bookmark(place_id: int, db: DB, user: CurrentUser) -> BookmarkState:
    """Idempotent: removing a bookmark that isn't there is not an error."""
    await db.execute(
        text("DELETE FROM bookmarks WHERE user_id = :u AND place_id = :p"),
        {"u": user.id, "p": place_id},
    )
    await db.commit()
    return BookmarkState(place_id=place_id, is_bookmarked=False)


@router.get("/me/bookmarks", response_model=BookmarkList, operation_id="listMyBookmarks")
async def list_my_bookmarks(db: DB, user: CurrentUser) -> BookmarkList:
    rows = (
        await db.execute(
            text(
                """
                SELECT b.place_id FROM bookmarks b JOIN places p ON p.id = b.place_id
                WHERE b.user_id = :u AND p.merged_into_id IS NULL
                  AND (NOT p.is_hidden OR (p.status = 'pending' AND p.creator_id = :u))
                ORDER BY b.created_at DESC, b.place_id DESC
                """
            ),
            {"u": user.id},
        )
    ).all()
    ids = [r.place_id for r in rows]
    summaries = await place_views.place_summaries(db, ids)
    return BookmarkList(items=[summaries[i] for i in ids if i in summaries])
