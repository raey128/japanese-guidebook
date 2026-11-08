"""Anonymous usage events (R18). No identity is ever stored: only a random per-browser UUID."""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Allowed event types and, per type, the allowed sources (None = no source).
ALLOWED: dict[str, set[str | None]] = {
    "app_open": {"first", "returning"},
    "place_open": {"pin", "top_pick", "search", "near_me", "list"},
    "save": {None, "pin", "top_pick", "search", "list", "detail"},
    "rank": {None, "new", "rerank"},
    "add": {"pin", "manual"},
    "search_no_result": {None},
    "near_me": {None, "granted", "denied"},
    "directions": {None, "ios", "android", "desktop"},
}
RETENTION_DAYS = 90
PER_BROWSER_HOURLY_CAP = 300


@dataclass
class EventIn:
    type: str
    source: str | None


def is_allowed(e: EventIn) -> bool:
    return e.type in ALLOWED and e.source in ALLOWED[e.type]


async def record(db: AsyncSession, browser_id: UUID, events: list[EventIn]) -> int:
    """Store the allowed events within the hourly cap per browser; returns how many were kept."""
    kept = [e for e in events if is_allowed(e)]
    if not kept:
        return 0
    recent = (
        await db.execute(
            text(
                "SELECT count(*) FROM events WHERE browser_id = :b "
                "AND created_at > now() - interval '1 hour'"
            ),
            {"b": browser_id},
        )
    ).scalar_one()
    room = max(0, PER_BROWSER_HOURLY_CAP - recent)
    kept = kept[:room]
    for e in kept:
        await db.execute(
            text("INSERT INTO events (browser_id, type, source) VALUES (:b, :t, :s)"),
            {"b": browser_id, "t": e.type, "s": e.source},
        )
    return len(kept)


async def rollup_and_expire(db: AsyncSession) -> tuple[int, int]:
    """Upsert daily totals for every finished day, then delete raw events past retention."""
    rolled = (
        await db.execute(
            text(
                """
                INSERT INTO event_daily (day, type, source, count, browsers)
                SELECT created_at::date, type, COALESCE(source, ''),
                       count(*), count(DISTINCT browser_id)
                FROM events WHERE created_at < current_date
                GROUP BY 1, 2, 3
                ON CONFLICT (day, type, source) DO UPDATE
                    SET count = EXCLUDED.count, browsers = EXCLUDED.browsers
                """
            )
        )
    ).rowcount
    deleted = (
        await db.execute(
            text("DELETE FROM events WHERE created_at < now() - make_interval(days => :d)"),
            {"d": RETENTION_DAYS},
        )
    ).rowcount
    return rolled or 0, deleted or 0


FUNNEL_SQL = """
WITH firsts AS (
    SELECT browser_id, min(created_at) AS first_at
    FROM events WHERE type = 'app_open' AND source = 'first'
    GROUP BY browser_id
)
SELECT date_trunc('week', f.first_at)::date AS week,
       count(*) AS first_visits,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.browser_id = f.browser_id
                                       AND e.type = 'place_open')) AS opened_place,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.browser_id = f.browser_id
                                       AND e.type = 'place_open'
                                       AND e.created_at <= f.first_at + interval '2 minutes'))
           AS opened_within_2min,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.browser_id = f.browser_id
                                       AND e.type = 'save')) AS saved,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM events e WHERE e.browser_id = f.browser_id
                                       AND e.type = 'rank')) AS ranked
FROM firsts f
GROUP BY 1 ORDER BY 1 DESC LIMIT :weeks
"""

NO_RESULT_SQL = """
SELECT date_trunc('week', created_at)::date AS week, count(*) AS n
FROM events WHERE type = 'search_no_result'
GROUP BY 1
"""
