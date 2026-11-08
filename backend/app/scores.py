"""Public scores.

Aggregates (`place_stats`, `category_stats`) are refreshed in the same transaction as every
ranking write via `refresh_aggregates`. The Bayesian public score is computed in SQL when read:
join `place_scores_sql()` (a subquery) wherever a score, ranker count or Unverified flag is needed.

    score = (k * prior + sum) / (k + count)          (NULL when count = 0 or the place is hidden)
    prior = mean of (city, subcategory)  ->  subcategory nationwide  ->  all rankings  ->  5.0

Hidden places are left out of `category_stats` (so out of every prior); closed places stay in.
"""

from collections.abc import Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings


async def refresh_aggregates(
    db: AsyncSession,
    place_ids: Iterable[int],
    categories: Iterable[tuple[int, int]],
) -> None:
    """Recompute place_stats for `place_ids` and category_stats for (city_id, subcategory_id)s."""
    pids = sorted(set(place_ids))
    cats = sorted(set(categories))
    if pids:
        await db.execute(
            text(
                """
                INSERT INTO place_stats (place_id, rank_sum, rank_count)
                SELECT p.id, COALESCE(SUM(r.personal_score), 0), COUNT(r.id)
                FROM places p LEFT JOIN rankings r ON r.place_id = p.id
                WHERE p.id = ANY(:ids)
                GROUP BY p.id
                ON CONFLICT (place_id) DO UPDATE
                    SET rank_sum = EXCLUDED.rank_sum, rank_count = EXCLUDED.rank_count
                """
            ),
            {"ids": pids},
        )
    for city_id, subcategory_id in cats:
        await db.execute(
            text(
                """
                INSERT INTO category_stats (city_id, subcategory_id, rank_sum, rank_count)
                SELECT :city_id, :subcategory_id,
                       COALESCE(SUM(r.personal_score), 0), COUNT(r.id)
                FROM rankings r JOIN places p ON p.id = r.place_id
                WHERE p.city_id = :city_id AND p.subcategory_id = :subcategory_id
                  AND NOT p.is_hidden
                ON CONFLICT (city_id, subcategory_id) DO UPDATE
                    SET rank_sum = EXCLUDED.rank_sum, rank_count = EXCLUDED.rank_count
                """
            ),
            {"city_id": city_id, "subcategory_id": subcategory_id},
        )


async def refresh_place(db: AsyncSession, place_id: int) -> None:
    """Refresh a place's own stats and its current category (e.g. after hide/unhide)."""
    row = (
        await db.execute(
            text("SELECT city_id, subcategory_id FROM places WHERE id = :id"), {"id": place_id}
        )
    ).one()
    await refresh_aggregates(db, [place_id], [(row.city_id, row.subcategory_id)])


# Columns: place_id, ranker_count, public_score (NULL = "Not yet ranked"), is_unverified.
# Binds: :prior_weight, :default_prior  (use `score_params()`).
PLACE_SCORES_SQL = """
SELECT p.id AS place_id,
       COALESCE(ps.rank_count, 0) AS ranker_count,
       CASE
         WHEN p.is_hidden OR COALESCE(ps.rank_count, 0) = 0 THEN NULL
         ELSE (
           CAST(:prior_weight AS float8) * COALESCE(
             cs.rank_sum / NULLIF(cs.rank_count, 0),
             sub.rank_sum / NULLIF(sub.rank_count, 0),
             tot.rank_sum / NULLIF(tot.rank_count, 0),
             CAST(:default_prior AS float8)
           ) + ps.rank_sum
         ) / (CAST(:prior_weight AS float8) + ps.rank_count)
       END AS public_score,
       (
         SELECT COUNT(DISTINCT r.user_id) FROM rankings r
         WHERE r.place_id = p.id AND r.user_id <> p.creator_id
       ) < 2 AS is_unverified
FROM places p
LEFT JOIN place_stats ps ON ps.place_id = p.id
LEFT JOIN category_stats cs
       ON cs.city_id = p.city_id AND cs.subcategory_id = p.subcategory_id
LEFT JOIN (
    SELECT subcategory_id, SUM(rank_sum) AS rank_sum, SUM(rank_count) AS rank_count
    FROM category_stats GROUP BY subcategory_id
) sub ON sub.subcategory_id = p.subcategory_id
CROSS JOIN (
    SELECT SUM(rank_sum) AS rank_sum, SUM(rank_count) AS rank_count FROM category_stats
) tot
"""


def place_scores_cte(name: str = "place_scores") -> str:
    """`<name> AS (...)` for use in a hand-written `WITH` clause."""
    return f"{name} AS ({PLACE_SCORES_SQL})"


def score_params() -> dict[str, float]:
    s = get_settings()
    return {"prior_weight": s.prior_weight, "default_prior": s.default_prior}


def badges(
    *,
    is_unverified: bool,
    is_closed: bool,
    closed_by_reports: bool,
    is_hidden: bool,
    is_pending: bool = False,
) -> list[str]:
    """Badge codes shown on rows, pins and detail pages."""
    out: list[str] = []
    if is_unverified:
        out.append("unverified")
    if is_closed:
        out.append("reported_closed" if closed_by_reports else "closed")
    if is_pending:
        out.append("pending")
    elif is_hidden:
        out.append("hidden")
    return out
