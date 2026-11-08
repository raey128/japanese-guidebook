"""Public ranked lists: a city plus a subcategory or top category, optionally narrowed to a
location. Sorted by Bayesian public score; unranked places are included and sort last."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app import scores
from app.deps import DB
from app.models import TOP_CATEGORIES
from app.place_views import load_reference, summary_from_row
from app.schemas.common import Message
from app.schemas.lists import ListItem, PublicList

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
       p.closed_by_reports, s.public_score, s.ranker_count, s.is_unverified
FROM places p JOIN place_scores s ON s.place_id = p.id
WHERE p.city_id = :city_id AND p.subcategory_id = ANY(:sub_ids)
  AND (CAST(:location_id AS integer) IS NULL OR p.location_id = CAST(:location_id AS integer))
  AND NOT p.is_hidden AND p.merged_into_id IS NULL
ORDER BY s.public_score DESC NULLS LAST, s.ranker_count DESC, p.name, p.id
LIMIT :limit OFFSET :offset
"""

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
    if sub is not None:
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

    title = f"{label} in {city.name}" + (f" › {loc.name}" if loc else "")
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
            ListItem(
                **summary.model_dump(),
                rank=rank if row.public_score is not None else None,
            )
        )
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
