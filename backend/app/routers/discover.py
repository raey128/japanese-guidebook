"""Discovery on the map: top picks in view (R15.2, R17.8) and type-ahead suggestions (R12)."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app import scores
from app.deps import DB, OptionalUser
from app.models import TOP_CATEGORIES
from app.place_views import SUMMARY_SQL, Reference, load_reference, summary_from_row
from app.schemas.common import PlaceSummary
from app.schemas.discover import Suggestions, TopPicks
from app.visibility import VISIBLE_SQL

router = APIRouter(tags=["discover"])

# Ranked candidates are pre-filtered on the cheap place_stats aggregate, then scored.
CANDIDATE_CAP = 500


def _sub_ids(ref: Reference, category: str | None) -> list[int] | None:
    """None = no filter; [] = unknown category (matches nothing)."""
    if not category:
        return None
    ids = [s.id for s in ref.subcategories.values() if s.slug == category]
    if not ids and category in TOP_CATEGORIES:
        ids = [s.id for s in ref.subcategories.values() if s.top_category == category]
    return ids


async def _summaries(db, ids: list[int], ref: Reference) -> dict[int, PlaceSummary]:  # type: ignore[no-untyped-def]
    if not ids:
        return {}
    rows = (await db.execute(text(SUMMARY_SQL), {"ids": ids, **scores.score_params()})).all()
    return {r.id: summary_from_row(r, ref) for r in rows}


@router.get("/top-picks", response_model=TopPicks, operation_id="getTopPicks")
async def top_picks(
    db: DB,
    min_lat: Annotated[float, Query(ge=-90, le=90)],
    min_lng: Annotated[float, Query(ge=-180, le=180)],
    max_lat: Annotated[float, Query(ge=-90, le=90)],
    max_lng: Annotated[float, Query(ge=-180, le=180)],
    category: str | None = None,
    limit: int = Query(10, ge=1, le=20),
) -> TopPicks:
    if min_lat >= max_lat or min_lng >= max_lng:
        raise HTTPException(422, "min_lat/min_lng must be smaller than max_lat/max_lng.")
    ref = await load_reference(db)
    sub_ids = _sub_ids(ref, category)
    if sub_ids == []:
        return TopPicks(kind="empty", items=[])

    # Public surfaces only: pending places never appear here, even for their submitter.
    where = (
        "p.geom && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326) "
        "AND NOT p.is_hidden AND p.merged_into_id IS NULL"
        + (" AND p.subcategory_id = ANY(:sub_ids)" if sub_ids else "")
    )
    params: dict[str, object] = {
        "min_lat": min_lat,
        "min_lng": min_lng,
        "max_lat": max_lat,
        "max_lng": max_lng,
        "sub_ids": sub_ids or [],
    }

    cand = (
        await db.execute(
            text(
                f"""
                SELECT p.id FROM places p JOIN place_stats ps ON ps.place_id = p.id
                WHERE {where} AND ps.rank_count > 0
                ORDER BY ps.rank_count DESC, p.id
                LIMIT :cap
                """
            ),
            {**params, "cap": CANDIDATE_CAP},
        )
    ).all()
    if cand:
        by_id = await _summaries(db, [r.id for r in cand], ref)
        ranked = [s for s in by_id.values() if s.public_score is not None and s.ranker_count > 0]
        ranked.sort(key=lambda s: (-(s.public_score or 0), -s.ranker_count, s.id))
        if ranked:
            return TopPicks(kind="ranked", items=ranked[:limit])

    team = (
        await db.execute(
            text(
                f"""
                SELECT p.id FROM places p
                WHERE {where} AND p.is_seed AND p.seed_reviewed
                ORDER BY p.geom <-> ST_SetSRID(ST_MakePoint(:clng, :clat), 4326), p.id
                LIMIT :limit
                """
            ),
            {**params, "clat": (min_lat + max_lat) / 2, "clng": (min_lng + max_lng) / 2, "limit": limit},
        )
    ).all()
    if team:
        ids = [r.id for r in team]
        by_id = await _summaries(db, ids, ref)
        return TopPicks(kind="team", items=[by_id[i] for i in ids if i in by_id])
    return TopPicks(kind="empty", items=[])


def _text_rank(q: str, *names: str | None) -> int | None:
    """0 = a name starts with q, 1 = a word starts with q, 2 = contains q; None = no match."""
    ql = q.casefold()
    best: int | None = None
    for n in names:
        if not n:
            continue
        nl = n.casefold()
        if nl.startswith(ql):
            r = 0
        elif any(w.startswith(ql) for w in nl.replace("&", " ").replace("・", " ").split()):
            r = 1
        elif ql in nl:
            r = 2
        else:
            continue
        best = r if best is None else min(best, r)
    return best


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


SUB_FILTER = "AND p.subcategory_id = ANY(:sub_ids)"

PLACE_MATCH_SQL = f"""
SELECT p.id, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng,
       (p.name ILIKE CAST(:like_q AS text) || '%'
        OR p.name_ja ILIKE CAST(:like_q AS text) || '%') AS prefix,
       greatest(similarity(p.name, CAST(:q AS text)),
                similarity(coalesce(p.name_ja, ''), CAST(:q AS text))) AS sim
FROM places p
WHERE {VISIBLE_SQL} AND p.merged_into_id IS NULL AND p.city_id = :city_id
  AND (p.name % CAST(:q AS text) OR p.name_ja % CAST(:q AS text)
       OR p.name ILIKE '%' || CAST(:like_q AS text) || '%'
       OR p.name_ja ILIKE '%' || CAST(:like_q AS text) || '%')
  {{sub_filter}}
ORDER BY prefix DESC, sim DESC, p.id
LIMIT 40
"""


@router.get("/suggest", response_model=Suggestions, operation_id="getSuggestions")
async def suggest(
    db: DB,
    viewer: OptionalUser,
    q: str,
    city: str,
    category: str | None = None,
    min_lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    min_lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    max_lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    max_lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
) -> Suggestions:
    empty = Suggestions(areas=[], subcategories=[], on_map=[], elsewhere=[])
    q = q.strip()[:100]
    if not q:
        return empty
    ref = await load_reference(db)
    c = next((x for x in ref.cities.values() if x.slug == city), None)
    if c is None:
        return empty

    area_hits = []
    for loc in ref.locations.values():
        if loc.city_id != c.id or loc.is_catch_all:
            continue
        r = _text_rank(q, loc.name, loc.name_ja, loc.slug.replace("-", " "))
        if r is not None:
            area_hits.append((r, loc.name, loc))
    areas = [loc for _, _, loc in sorted(area_hits, key=lambda t: (t[0], t[1]))[:3]]

    sub_ids = _sub_ids(ref, category)
    sub_hits = []
    for s in ref.subcategories.values():
        if sub_ids is not None and s.id not in sub_ids:
            continue
        r = _text_rank(q, s.name, s.slug.replace("_", " "))
        if r is not None:
            sub_hits.append((r, s.name, s))
    subcategories = [s for _, _, s in sorted(sub_hits, key=lambda t: (t[0], t[1]))[:3]]

    if sub_ids == []:
        return Suggestions(areas=areas, subcategories=subcategories, on_map=[], elsewhere=[])
    rows = (
        await db.execute(
            text(PLACE_MATCH_SQL.format(sub_filter=SUB_FILTER if sub_ids else "")),
            {
                "q": q,
                "like_q": _escape_like(q),
                "city_id": c.id,
                "viewer_id": viewer.id if viewer else None,
                "sub_ids": sub_ids or [],
            },
        )
    ).all()
    has_bbox = None not in (min_lat, min_lng, max_lat, max_lng)

    def inside(r) -> bool:  # type: ignore[no-untyped-def]
        if not has_bbox:
            return False
        return min_lat <= r.lat <= max_lat and min_lng <= r.lng <= max_lng  # type: ignore[operator]

    on_ids = [r.id for r in rows if inside(r)][:5]
    else_ids = [r.id for r in rows if not inside(r)][:5]
    by_id = await _summaries(db, on_ids + else_ids, ref)
    return Suggestions(
        areas=areas,
        subcategories=subcategories,
        on_map=[by_id[i] for i in on_ids if i in by_id],
        elsewhere=[by_id[i] for i in else_ids if i in by_id],
    )
