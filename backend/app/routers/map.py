"""Map browsing (R6.1, R6.2): clusters when zoomed out, capped raw points when zoomed in."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app import scores
from app.deps import DB, OptionalUser, SettingsDep
from app.schemas.map import MapCluster, MapPoint, MapResponse
from app.visibility import VISIBLE_SQL

router = APIRouter(tags=["map"])


def cluster_cell_deg(zoom: int) -> float:
    """Grid cell size in degrees: a quarter of a 256px web-mercator tile's width at `zoom`.

    (360 / 2^zoom is one tile's width; a quarter is roughly a 64px bubble.) At zoom 10 that is
    ~0.088 degrees (about 10 km). Clusters of one place are still returned as clusters.
    """
    return 360.0 / (2**zoom) / 4.0


POINT_DETAIL_SQL = f"""
WITH {scores.place_scores_cte()}
SELECT p.id, p.name, p.name_ja, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng,
       sc.slug AS subcategory_slug, sc.top_category,
       p.is_hidden, p.is_closed, p.closed_by_reports, p.status,
       s.public_score, s.ranker_count, s.is_unverified
FROM places p
JOIN subcategories sc ON sc.id = p.subcategory_id
JOIN place_scores s ON s.place_id = p.id
WHERE p.id = ANY(:ids)
"""


@router.get("/map", response_model=MapResponse, operation_id="getMap")
async def get_map(
    db: DB,
    user: OptionalUser,
    settings: SettingsDep,
    min_lat: Annotated[float, Query(ge=-90, le=90)],
    min_lng: Annotated[float, Query(ge=-180, le=180)],
    max_lat: Annotated[float, Query(ge=-90, le=90)],
    max_lng: Annotated[float, Query(ge=-180, le=180)],
    zoom: Annotated[int, Query(ge=0, le=22)],
    category: str | None = None,
    location: str | None = None,
    mode: Literal["all", "mine", "want_to_go"] = "all",
) -> MapResponse:
    if min_lat >= max_lat or min_lng >= max_lng:
        raise HTTPException(422, "min_lat/min_lng must be smaller than max_lat/max_lng.")
    if mode != "all" and user is None:
        raise HTTPException(401, "Sign in to do that.")

    where = [
        "p.geom && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)",
        VISIBLE_SQL,
        "p.merged_into_id IS NULL",
    ]
    params: dict[str, object] = {
        "viewer_id": user.id if user else None,
        "min_lat": min_lat,
        "min_lng": min_lng,
        "max_lat": max_lat,
        "max_lng": max_lng,
    }
    if category:
        where.append(
            "p.subcategory_id IN (SELECT id FROM subcategories "
            "WHERE slug = :category OR top_category = :category)"
        )
        params["category"] = category
    if location:
        where.append("p.location_id IN (SELECT id FROM locations WHERE slug = :location)")
        params["location"] = location
    if mode == "mine" and user is not None:
        where.append(
            "EXISTS (SELECT 1 FROM rankings r WHERE r.place_id = p.id AND r.user_id = :uid)"
        )
        params["uid"] = user.id
    elif mode == "want_to_go" and user is not None:
        where.append(
            "EXISTS (SELECT 1 FROM bookmarks b WHERE b.place_id = p.id AND b.user_id = :uid)"
        )
        params["uid"] = user.id
    where_sql = " AND ".join(where)

    if zoom < settings.cluster_max_zoom:
        rows = (
            await db.execute(
                text(
                    f"""
                    SELECT COUNT(*) AS count, AVG(ST_Y(p.geom)) AS lat, AVG(ST_X(p.geom)) AS lng
                    FROM places p
                    WHERE {where_sql}
                    GROUP BY ST_SnapToGrid(p.geom, :cell)
                    ORDER BY 2, 3
                    """
                ),
                {**params, "cell": cluster_cell_deg(zoom)},
            )
        ).all()
        return MapResponse(
            kind="clusters",
            clusters=[MapCluster(lat=r.lat, lng=r.lng, count=r.count) for r in rows],
            points=[],
            truncated=False,
        )

    cap = settings.map_point_cap
    # Cheap deterministic order (most-ranked first, then id) so the scores are only computed
    # for the capped ids below.
    id_rows = (
        await db.execute(
            text(
                f"""
                SELECT p.id FROM places p
                LEFT JOIN place_stats ps ON ps.place_id = p.id
                WHERE {where_sql}
                ORDER BY COALESCE(ps.rank_count, 0) DESC, p.id
                LIMIT :lim
                """
            ),
            {**params, "lim": cap + 1},
        )
    ).all()
    ids = [r.id for r in id_rows]
    truncated = len(ids) > cap
    ids = ids[:cap]
    if not ids:
        return MapResponse(kind="points", clusters=[], points=[], truncated=False)

    detail = (await db.execute(text(POINT_DETAIL_SQL), {"ids": ids, **scores.score_params()})).all()
    by_id = {r.id: r for r in detail}
    saved: set[int] = set()
    ranked: set[int] = set()
    if user is not None:
        saved = {
            r.place_id
            for r in await db.execute(
                text("SELECT place_id FROM bookmarks WHERE user_id = :u AND place_id = ANY(:ids)"),
                {"u": user.id, "ids": ids},
            )
        }
        ranked = {
            r.place_id
            for r in await db.execute(
                text("SELECT place_id FROM rankings WHERE user_id = :u AND place_id = ANY(:ids)"),
                {"u": user.id, "ids": ids},
            )
        }
    points = []
    for pid in ids:
        r = by_id.get(pid)
        if r is None:
            continue
        points.append(
            MapPoint(
                id=r.id,
                lat=r.lat,
                lng=r.lng,
                name=r.name,
                name_ja=r.name_ja,
                subcategory_slug=r.subcategory_slug,
                top_category=r.top_category,
                public_score=None if r.public_score is None else round(r.public_score, 2),
                ranker_count=r.ranker_count,
                badges=scores.badges(  # type: ignore[arg-type]
                    is_unverified=r.is_unverified,
                    is_closed=r.is_closed,
                    closed_by_reports=r.closed_by_reports,
                    is_hidden=r.is_hidden,
                    is_pending=r.status == "pending",
                ),
                saved=r.id in saved,
                ranked=r.id in ranked,
            )
        )
    return MapResponse(kind="points", clusters=[], points=points, truncated=truncated)
