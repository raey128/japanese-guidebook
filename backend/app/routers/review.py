"""Admin review of manual adds (R13.4–R13.6, R13.9) and "My submissions" (R13.7)."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, text

from app import ranking as ranking_core
from app import scores
from app.deps import DB, AdminUser, CurrentUser
from app.models import Place, Ranking
from app.place_views import place_summaries
from app.schemas.common import ANONYMOUS, Message, PlaceSummary
from app.schemas.review import PendingCount, PendingPlace, PendingQueue, RejectIn, Submission, Submissions

router = APIRouter(tags=["review"])

ERRORS: dict[int | str, dict] = {403: {"model": Message}, 404: {"model": Message}, 409: {"model": Message}}


async def _pending(db, place_id: int) -> Place:  # type: ignore[no-untyped-def]
    place = (
        await db.execute(select(Place).where(Place.id == place_id).execution_options(populate_existing=True))
    ).scalar_one_or_none()
    if place is None:
        raise HTTPException(404, "Place not found.")
    if place.status != "pending":
        raise HTTPException(409, "This place isn't waiting for review.")
    return place


@router.get("/admin/pending", response_model=PendingQueue, operation_id="listPendingPlaces")
async def list_pending(db: DB, _: AdminUser) -> PendingQueue:
    rows = (
        await db.execute(
            text(
                """
                SELECT p.id, p.created_at, u.username, u.is_private,
                       ARRAY(SELECT n.id FROM places n
                             WHERE n.id <> p.id AND NOT n.is_hidden AND n.merged_into_id IS NULL
                               AND ST_DWithin(n.geom::geography, p.geom::geography, 200)
                             ORDER BY n.geom <-> p.geom LIMIT 10) AS nearby
                FROM places p JOIN users u ON u.id = p.creator_id
                WHERE p.status = 'pending'
                ORDER BY p.created_at, p.id
                """
            )
        )
    ).all()
    ids = {r.id for r in rows} | {n for r in rows for n in r.nearby}
    summaries = await place_summaries(db, list(ids))
    return PendingQueue(
        items=[
            PendingPlace(
                place=summaries[r.id],
                submitter=ANONYMOUS if r.is_private else r.username,
                created_at=r.created_at.isoformat(),
                nearby=[summaries[n] for n in r.nearby if n in summaries],
            )
            for r in rows
            if r.id in summaries
        ]
    )


@router.get("/admin/pending/count", response_model=PendingCount, operation_id="countPendingPlaces")
async def count_pending(db: DB, _: AdminUser) -> PendingCount:
    n = (await db.execute(text("SELECT count(*) FROM places WHERE status = 'pending'"))).scalar_one()
    return PendingCount(count=n)


@router.post(
    "/admin/pending/{place_id}/approve",
    response_model=PlaceSummary,
    responses=ERRORS,
    operation_id="approvePendingPlace",
)
async def approve(place_id: int, db: DB, _: AdminUser) -> PlaceSummary:
    place = await _pending(db, place_id)
    place.status = "live"
    place.is_hidden = False
    place.review_reason = None
    await db.execute(text("UPDATE places SET reviewed_at = now() WHERE id = :p"), {"p": place.id})
    await db.flush()
    # The submitter's rankings start counting in the public score and the category prior.
    await scores.refresh_place(db, place.id)
    await db.commit()
    return (await place_summaries(db, [place.id]))[place.id]


@router.post(
    "/admin/pending/{place_id}/reject",
    response_model=Message,
    responses=ERRORS,
    operation_id="rejectPendingPlace",
)
async def reject(place_id: int, body: RejectIn, db: DB, _: AdminUser) -> Message:
    place = await _pending(db, place_id)
    place.status = "rejected"
    place.review_reason = (body.reason or "").strip() or None
    rankings = (await db.execute(select(Ranking).where(Ranking.place_id == place.id))).scalars().all()
    for r in rankings:
        await ranking_core.delete_ranking(db, r)  # keeps the owners' list positions compact
    await db.execute(text("DELETE FROM bookmarks WHERE place_id = :p"), {"p": place.id})
    await db.execute(text("UPDATE places SET reviewed_at = now() WHERE id = :p"), {"p": place.id})
    await db.flush()
    await scores.refresh_place(db, place.id)
    await db.commit()
    return Message(detail="Rejected.")


@router.get("/me/submissions", response_model=Submissions, operation_id="listMySubmissions")
async def my_submissions(db: DB, user: CurrentUser) -> Submissions:
    """Manual adds: still pending, rejected, or approved (reviewed_at set)."""
    rows = (
        await db.execute(
            text(
                """
                SELECT id, name, status, review_reason, created_at, reviewed_at FROM places
                WHERE creator_id = :u AND (status <> 'live' OR reviewed_at IS NOT NULL)
                ORDER BY created_at DESC, id DESC
                """
            ),
            {"u": user.id},
        )
    ).all()
    return Submissions(
        items=[
            Submission(
                place_id=r.id,
                name=r.name,
                status=r.status,
                review_reason=r.review_reason,
                created_at=r.created_at.isoformat(),
                reviewed_at=r.reviewed_at.isoformat() if r.reviewed_at else None,
            )
            for r in rows
        ]
    )

