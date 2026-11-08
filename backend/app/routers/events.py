"""Anonymous usage events (R18.1, R18.2) and the admin Stats funnel (R18.4)."""

from fastapi import APIRouter, Query, Response
from sqlalchemy import text

from app import events as ev
from app.deps import DB, AdminUser
from app.schemas.events import EventBatch, FunnelWeek, Stats

router = APIRouter(tags=["events"])


@router.post("/events", status_code=204, operation_id="postEvents")
async def post_events(body: EventBatch, db: DB) -> Response:
    """Fire-and-forget: always 204, even when events are dropped (unknown type, over the cap)."""
    await ev.record(db, body.browser_id, [ev.EventIn(e.type, e.source) for e in body.events])
    await db.commit()
    return Response(status_code=204)


@router.get("/admin/stats", response_model=Stats, operation_id="getStats")
async def get_stats(db: DB, _: AdminUser, weeks: int = Query(8, ge=1, le=13)) -> Stats:
    rows = (await db.execute(text(ev.FUNNEL_SQL), {"weeks": weeks})).all()
    no_result = {r.week: r.n for r in await db.execute(text(ev.NO_RESULT_SQL))}
    return Stats(
        weeks=[
            FunnelWeek(
                week=r.week.isoformat(),
                first_visits=r.first_visits,
                opened_place=r.opened_place,
                opened_within_2min=r.opened_within_2min,
                saved=r.saved,
                ranked=r.ranked,
                searches_no_result=no_result.get(r.week, 0),
            )
            for r in rows
        ]
    )
