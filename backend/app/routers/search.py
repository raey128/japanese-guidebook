"""Place search by English or Japanese name (pg_trgm, GIN-indexed)."""

from fastapi import APIRouter, Query
from sqlalchemy import text

from app import scores
from app.deps import DB, OptionalUser
from app.models import TOP_CATEGORIES
from app.place_views import SUMMARY_SQL, load_reference, summary_from_row
from app.schemas.lists import SearchItem, SearchResults

router = APIRouter(tags=["search"])

# Step 1 uses only the places table so the trigram GIN indexes drive it and the (heavier)
# score CTE is joined for the matched ids only (SUMMARY_SQL, step 2).
MATCH_SQL = """
SELECT p.id,
       greatest(
           similarity(p.name, CAST(:q AS text)),
           similarity(coalesce(p.name_ja, ''), CAST(:q AS text))
       ) AS sim
FROM places p
WHERE NOT p.is_hidden AND p.merged_into_id IS NULL
  AND (p.name % CAST(:q AS text) OR p.name_ja % CAST(:q AS text)
       OR p.name ILIKE '%' || CAST(:like_q AS text) || '%'
       OR p.name_ja ILIKE '%' || CAST(:like_q AS text) || '%')
{filters}
ORDER BY sim DESC, p.id
LIMIT :limit
"""


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/search", response_model=SearchResults, operation_id="searchPlaces")
async def search_places(
    db: DB,
    viewer: OptionalUser,
    q: str = "",
    city: str | None = None,
    location: str | None = None,
    category: str | None = None,
    limit: int = Query(20, ge=1, le=50),
) -> SearchResults:
    q = q.strip()
    if not q:
        return SearchResults(items=[])
    ref = await load_reference(db)

    clauses: list[str] = []
    params: dict[str, object] = {"q": q, "like_q": _escape_like(q), "limit": limit}
    if city:
        c = next((c for c in ref.cities.values() if c.slug == city), None)
        if c is None:
            return SearchResults(items=[])
        clauses.append("AND p.city_id = :city_id")
        params["city_id"] = c.id
    if location:
        loc = next((x for x in ref.locations.values() if x.slug == location), None)
        if loc is None:
            return SearchResults(items=[])
        clauses.append("AND p.location_id = :location_id")
        params["location_id"] = loc.id
    if category:
        sub_ids = [s.id for s in ref.subcategories.values() if s.slug == category]
        if not sub_ids and category in TOP_CATEGORIES:
            sub_ids = [s.id for s in ref.subcategories.values() if s.top_category == category]
        if not sub_ids:
            return SearchResults(items=[])
        clauses.append("AND p.subcategory_id = ANY(:sub_ids)")
        params["sub_ids"] = sub_ids

    matched = (await db.execute(text(MATCH_SQL.format(filters="\n  ".join(clauses))), params)).all()
    ids = [m.id for m in matched]
    if not ids:
        return SearchResults(items=[])

    rows = (await db.execute(text(SUMMARY_SQL), {"ids": ids, **scores.score_params()})).all()
    by_id = {r.id: r for r in rows}

    bookmarked: set[int] = set()
    ranking_ids: dict[int, int] = {}
    if viewer is not None:
        bookmarked = {
            r.place_id
            for r in await db.execute(
                text("SELECT place_id FROM bookmarks WHERE user_id = :u AND place_id = ANY(:ids)"),
                {"u": viewer.id, "ids": ids},
            )
        }
        ranking_ids = {
            r.place_id: r.id
            for r in await db.execute(
                text(
                    "SELECT id, place_id FROM rankings WHERE user_id = :u AND place_id = ANY(:ids)"
                ),
                {"u": viewer.id, "ids": ids},
            )
        }
    items = [
        SearchItem(
            **summary_from_row(by_id[i], ref).model_dump(),
            is_bookmarked=i in bookmarked,
            my_ranking_id=ranking_ids.get(i),
        )
        for i in ids
        if i in by_id
    ]
    return SearchResults(items=items)
