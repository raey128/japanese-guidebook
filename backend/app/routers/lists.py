"""Public ranked lists: a city plus a subcategory or top category, optionally narrowed to a
location. Sorted by Bayesian public score; unranked places are included and sort last."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app import scores
from app.deps import DB
from app.models import TOP_CATEGORIES
from app.place_views import load_reference, summary_from_row
from app.schemas.common import Message
from app.schemas.common import CityOut, LocationOut
from app.schemas.lists import FeaturedList, FeaturedLists, ListItem, PublicList

router = APIRouter(tags=["lists"])

TOP_CATEGORY_NAMES = {
    "food": "Food",
    "sights": "Sights",
    "stays": "Stays",
    "experiences": "Experiences",
}

LIST_SQL = f"""
WITH {scores.place_scores_cte()}
SELECT p.id, p.name, p.name_ja, p.address, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng,
       p.subcategory_id, p.location_id, p.city_id, p.is_hidden, p.is_closed,
       p.closed_by_reports, p.status, s.public_score, s.ranker_count, s.is_unverified
FROM places p JOIN place_scores s ON s.place_id = p.id
WHERE p.city_id = :city_id AND p.subcategory_id = ANY(:sub_ids)
  AND (CAST(:location_id AS integer) IS NULL OR p.location_id = CAST(:location_id AS integer))
  AND NOT p.is_hidden AND p.merged_into_id IS NULL
ORDER BY s.public_score DESC NULLS LAST, s.ranker_count DESC, p.name, p.id
LIMIT :limit OFFSET :offset
"""

# "all" in /lists/{city}/all: every category in the city ("Top rated in Tokyo").
ALL = "all"
FEATURED_ITEMS = 5
FEATURED_SUBCATEGORIES = 8

COUNT_SQL = """
SELECT COUNT(*) FROM places p
WHERE p.city_id = :city_id AND p.subcategory_id = ANY(:sub_ids)
  AND (CAST(:location_id AS integer) IS NULL OR p.location_id = CAST(:location_id AS integer))
  AND NOT p.is_hidden AND p.merged_into_id IS NULL
"""


@router.get(
    "/lists/{city_slug}/{category}",
    response_model=PublicList,
    responses={404: {"model": Message}},
    operation_id="getPublicList",
)
async def get_public_list(
    city_slug: str,
    category: str,
    db: DB,
    location: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> PublicList:
    ref = await load_reference(db)
    city = next((c for c in ref.cities.values() if c.slug == city_slug), None)
    if city is None:
        raise HTTPException(404, "City not found.")

    sub = next((s for s in ref.subcategories.values() if s.slug == category), None)
    top_category: str | None
    if category == ALL:
        sub_ids = list(ref.subcategories)
        top_category = None
        label = "Top rated"
    elif sub is not None:
        sub_ids = [sub.id]
        top_category = sub.top_category
        label = sub.name
    elif category in TOP_CATEGORIES:
        sub_ids = [s.id for s in ref.subcategories.values() if s.top_category == category]
        top_category = category
        label = TOP_CATEGORY_NAMES[category]
    else:
        raise HTTPException(404, "Category not found.")

    loc = None
    if location:
        loc = next(
            (x for x in ref.locations.values() if x.slug == location and x.city_id == city.id),
            None,
        )
        if loc is None:
            raise HTTPException(404, "Location not found.")

    title = (f"Top rated in {city.name}" if category == ALL else f"{label} in {city.name}") + (
        f" › {loc.name}" if loc else ""
    )
    total, items = await _list_page(db, ref, city, sub_ids, loc, limit, offset)
    return PublicList(
        title=title,
        city=city,
        subcategory=sub,
        top_category=top_category,  # type: ignore[arg-type]
        location=loc,
        total=total,
        limit=limit,
        offset=offset,
        items=items,
    )


async def _list_page(  # type: ignore[no-untyped-def]
    db, ref, city: CityOut, sub_ids: list[int], loc: LocationOut | None, limit: int, offset: int
) -> tuple[int, list[ListItem]]:
    filters = {"city_id": city.id, "sub_ids": sub_ids, "location_id": loc.id if loc else None}
    total = (await db.execute(text(COUNT_SQL), filters)).scalar_one()
    rows = (
        await db.execute(
            text(LIST_SQL),
            {**filters, **scores.score_params(), "limit": limit, "offset": offset},
        )
    ).all()
    items = []
    rank = offset
    for row in rows:
        summary = summary_from_row(row, ref)
        if row.public_score is not None:
            rank += 1
        items.append(
            ListItem(**summary.model_dump(), rank=rank if row.public_score is not None else None)
        )
    return total, items


@router.get(
    "/lists/{city_slug}",
    response_model=FeaturedLists,
    responses={404: {"model": Message}},
    operation_id="getFeaturedLists",
)
async def get_featured_lists(city_slug: str, db: DB) -> FeaturedLists:
    """The Lists tab (R14.7): "Top rated in <city>", then the top of each category that has
    places, then the busiest kinds (most ranked, then most places). Empty lists are left out."""
    ref = await load_reference(db)
    city = next((c for c in ref.cities.values() if c.slug == city_slug), None)
    if city is None:
        raise HTTPException(404, "City not found.")

    counts = (
        await db.execute(
            text(
                """
                SELECT p.subcategory_id, COUNT(*) AS places,
                       COUNT(*) FILTER (WHERE COALESCE(ps.rank_count, 0) > 0) AS ranked
                FROM places p LEFT JOIN place_stats ps ON ps.place_id = p.id
                WHERE p.city_id = :city_id AND NOT p.is_hidden AND p.merged_into_id IS NULL
                GROUP BY p.subcategory_id
                """
            ),
            {"city_id": city.id},
        )
    ).all()
    by_sub = {r.subcategory_id: (r.places, r.ranked) for r in counts}

    plans: list[tuple[str, str, str, str | None, list[int]]] = [
        (ALL, "all", f"Top rated in {city.name}", None, list(ref.subcategories))
    ]
    for top in TOP_CATEGORIES:
        ids = [s.id for s in ref.subcategories.values() if s.top_category == top]
        if any(by_sub.get(i, (0, 0))[0] for i in ids):
            plans.append((top, "top", f"Top {TOP_CATEGORY_NAMES[top]} in {city.name}", top, ids))
    busiest = sorted(
        (s for s in ref.subcategories.values() if by_sub.get(s.id, (0, 0))[0] >= 2),
        key=lambda s: (-by_sub[s.id][1], -by_sub[s.id][0], s.name),
    )[:FEATURED_SUBCATEGORIES]
    for s in busiest:
        plans.append((s.slug, "sub", f"Top {s.name} in {city.name}", s.top_category, [s.id]))

    lists = []
    for key, kind, title, top_category, ids in plans:
        total, items = await _list_page(db, ref, city, ids, None, FEATURED_ITEMS, 0)
        if total == 0:
            continue
        ranked = sum(by_sub.get(i, (0, 0))[1] for i in ids)
        lists.append(
            FeaturedList(
                key=key,
                kind=kind,  # type: ignore[arg-type]
                title=title,
                top_category=top_category,  # type: ignore[arg-type]
                total=total,
                ranked=ranked,
                items=items,
            )
        )
    return FeaturedLists(city=city, lists=lists)
