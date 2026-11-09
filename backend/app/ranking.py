"""Ranking (Lists): the core module.

A List is one user's rankings for (city, subcategory, bucket). Each ranking has an integer
position (1 = best) and a personal score derived from it. Every write here:

  * reorders the affected List(s) and renumbers positions 1..n,
  * recomputes every personal score in them,
  * bumps each affected List's version,
  * refreshes the public-score aggregates,

all inside the caller's transaction (callers commit). The binary-search comparison flow runs in
the browser; the server only checks `expected_version` and never re-checks the answers.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app import scores
from app.models import BUCKETS, Bookmark, Place, RankList, Ranking
from app.visibility import can_use

BANDS: dict[str, tuple[float, float]] = {
    "liked": (6.7, 10.0),
    "fine": (3.4, 6.7),
    "disliked": (0.0, 3.4),
}
NOTE_MAX_LEN = 1000
# R3.6: a rating below this needs a comment, so low ratings always say why.
COMMENT_REQUIRED_BELOW = 3
LOW_RATING_NEEDS_COMMENT = "Please add a comment: ratings below 3 stars need a reason."


def bucket_for_rating(rating: int) -> str:
    """4-5 stars = liked, 3 = fine, 1-2 = disliked."""
    if not 1 <= rating <= 5:
        raise ValueError("Rating must be 1-5 stars.")
    return "liked" if rating >= 4 else "fine" if rating == 3 else "disliked"


def check_review(rating: int | None, note: str | None) -> None:
    """Raise ValueError when a low rating has no comment."""
    if rating is not None and rating < COMMENT_REQUIRED_BELOW and not (note or "").strip():
        raise ValueError(LOW_RATING_NEEDS_COMMENT)


def personal_score(bucket: str, i: int, n: int) -> float:
    """Place i of n (1 = best) in the bucket's band [lo, hi]: lo + (hi-lo)*(n-i+0.5)/n."""
    lo, hi = BANDS[bucket]
    return lo + (hi - lo) * (n - i + 0.5) / n


@dataclass(frozen=True)
class ListKey:
    user_id: int
    city_id: int
    subcategory_id: int
    bucket: str


@dataclass
class ListSnapshot:
    key: ListKey
    version: int
    items: list[Ranking]  # ordered best first


class StaleListError(Exception):
    def __init__(self, current_version: int):
        super().__init__("This list changed since you started ranking.")
        self.current_version = current_version


class RankingNotAllowed(Exception):
    """The place can't take new rankings (closed, hidden or merged away)."""


def _key_of(r: Ranking) -> ListKey:
    return ListKey(r.user_id, r.city_id, r.subcategory_id, r.bucket)


async def _lock_list(db: AsyncSession, key: ListKey) -> RankList:
    """Create-if-missing and row-lock a List, serialising concurrent writes to it."""
    await db.execute(
        text(
            """
            INSERT INTO rank_lists (user_id, city_id, subcategory_id, bucket, version)
            VALUES (:u, :c, :s, :b, 0) ON CONFLICT DO NOTHING
            """
        ),
        {"u": key.user_id, "c": key.city_id, "s": key.subcategory_id, "b": key.bucket},
    )
    result = await db.execute(
        select(RankList)
        .where(
            RankList.user_id == key.user_id,
            RankList.city_id == key.city_id,
            RankList.subcategory_id == key.subcategory_id,
            RankList.bucket == key.bucket,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _items(db: AsyncSession, key: ListKey) -> list[Ranking]:
    result = await db.execute(
        select(Ranking)
        .where(
            Ranking.user_id == key.user_id,
            Ranking.city_id == key.city_id,
            Ranking.subcategory_id == key.subcategory_id,
            Ranking.bucket == key.bucket,
        )
        .order_by(Ranking.position, Ranking.id)
    )
    return list(result.scalars())


def _write_order(key: ListKey, ordered: list[Ranking]) -> None:
    """Assign list membership, positions 1..n and scores (uniqueness is checked at commit).

    Doesn't touch `updated_at`: that records the user's own last action on a ranking (used by
    merges to keep the most recent one), not knock-on rescoring."""
    n = len(ordered)
    for i, r in enumerate(ordered, start=1):
        r.city_id, r.subcategory_id, r.bucket = key.city_id, key.subcategory_id, key.bucket
        r.position = i
        r.personal_score = personal_score(key.bucket, i, n)


async def get_snapshot(
    db: AsyncSession, user_id: int, city_id: int, subcategory_id: int
) -> dict[str, ListSnapshot]:
    """All three bucket Lists for (user, city, subcategory) with their versions."""
    versions = {
        row.bucket: row.version
        for row in (
            await db.execute(
                select(RankList.bucket, RankList.version).where(
                    RankList.user_id == user_id,
                    RankList.city_id == city_id,
                    RankList.subcategory_id == subcategory_id,
                )
            )
        ).all()
    }
    out: dict[str, ListSnapshot] = {}
    for bucket in BUCKETS:
        key = ListKey(user_id, city_id, subcategory_id, bucket)
        out[bucket] = ListSnapshot(key, versions.get(bucket, 0), await _items(db, key))
    return out


async def get_user_ranking(db: AsyncSession, user_id: int, place_id: int) -> Ranking | None:
    result = await db.execute(
        select(Ranking).where(Ranking.user_id == user_id, Ranking.place_id == place_id)
    )
    return result.scalar_one_or_none()


async def place_ranking(
    db: AsyncSession,
    *,
    user_id: int,
    place: Place,
    bucket: str,
    position: int,
    expected_version: int,
) -> Ranking:
    """Insert a new ranking, or move the user's existing ranking of `place` (re-rank).

    `position` is 1-based among the target List's other items (so 1..n+1).
    Raises StaleListError (-> 409), RankingNotAllowed, or ValueError for a bad position.
    """
    if bucket not in BANDS:
        raise ValueError("Unknown bucket.")
    if not can_use(place, user_id):
        raise RankingNotAllowed("This place can't be ranked.")

    target = ListKey(user_id, place.city_id, place.subcategory_id, bucket)
    existing = await get_user_ranking(db, user_id, place.id)
    if existing is None and place.is_closed:
        raise RankingNotAllowed("This place has been reported closed and can't take new rankings.")

    old_key = _key_of(existing) if existing is not None else None
    # Lock in a stable order to avoid deadlocks between two Lists.
    keys = sorted({target} | ({old_key} if old_key else set()), key=lambda k: k.bucket)
    locked = {k: await _lock_list(db, k) for k in keys}
    if locked[target].version != expected_version:
        raise StaleListError(locked[target].version)

    others = [r for r in await _items(db, target) if existing is None or r.id != existing.id]
    if not 1 <= position <= len(others) + 1:
        raise ValueError(f"Position must be between 1 and {len(others) + 1}.")

    if existing is None:
        ranking = Ranking(
            user_id=user_id,
            place_id=place.id,
            city_id=target.city_id,
            subcategory_id=target.subcategory_id,
            bucket=bucket,
            position=position,
            personal_score=0.0,
        )
        db.add(ranking)
    else:
        ranking = existing

    others.insert(position - 1, ranking)
    _write_order(target, others)
    ranking.updated_at = datetime.now(UTC)
    locked[target].version += 1
    affected_places = {r.place_id for r in others}

    if old_key is not None and old_key != target:
        remaining = [r for r in await _items(db, old_key) if r.id != ranking.id]
        _write_order(old_key, remaining)
        locked[old_key].version += 1
        affected_places |= {r.place_id for r in remaining}

    # Ranking a bookmarked place removes it from want-to-go (R7.2).
    await db.execute(
        delete(Bookmark).where(Bookmark.user_id == user_id, Bookmark.place_id == place.id)
    )
    await db.flush()
    # Every ranking in the touched Lists got a new personal score, so refresh all their places.
    affected_places.add(place.id)
    await scores.refresh_aggregates(db, affected_places, [(place.city_id, place.subcategory_id)])
    return ranking


async def delete_ranking(db: AsyncSession, ranking: Ranking) -> None:
    key = _key_of(ranking)
    lst = await _lock_list(db, key)
    place_id = ranking.place_id
    await db.delete(ranking)
    await db.flush()
    remaining = await _items(db, key)
    _write_order(key, remaining)
    lst.version += 1
    await db.flush()
    # Remaining rankings were rescored, so their places' aggregates change too.
    await scores.refresh_aggregates(
        db, [place_id, *(r.place_id for r in remaining)], [(key.city_id, key.subcategory_id)]
    )


async def update_note(
    db: AsyncSession,
    ranking: Ranking,
    *,
    note: str | None,
    visit_month: int | None,
    visit_year: int | None,
) -> Ranking:
    """Edit note and visit date without re-ranking."""
    if note is not None:
        note = note.strip() or None
    if note is not None and len(note) > NOTE_MAX_LEN:
        raise ValueError(f"Notes can be at most {NOTE_MAX_LEN} characters.")
    if (visit_month is None) != (visit_year is None):
        raise ValueError("Give both a visit month and year, or neither.")
    if visit_month is not None and not 1 <= visit_month <= 12:
        raise ValueError("Visit month must be 1–12.")
    check_review(ranking.rating, note)
    ranking.note = note
    ranking.visit_month = visit_month
    ranking.visit_year = visit_year
    ranking.updated_at = datetime.now(UTC)
    await db.flush()
    return ranking


async def rank_by_rating(db: AsyncSession, *, user_id: int, place: Place, rating: int) -> Ranking:
    """Rank a place from its star rating alone (adding a place you've been to, R3.6): it goes
    in the rating's bucket below every item rated the same or higher, so it lands among its
    peers without any comparisons. Unrated items count as the middle of their bucket."""
    bucket = bucket_for_rating(rating)
    key = ListKey(user_id, place.city_id, place.subcategory_id, bucket)
    lst = await _lock_list(db, key)
    default = {"liked": 4, "fine": 3, "disliked": 2}[bucket]
    others = [r for r in await _items(db, key) if r.place_id != place.id]
    position = 1 + sum(1 for r in others if (r.rating or default) >= rating)
    ranking = await place_ranking(
        db,
        user_id=user_id,
        place=place,
        bucket=bucket,
        position=position,
        expected_version=lst.version,
    )
    ranking.rating = rating
    return ranking


def nearest_score_position(bucket: str, score: float, others_count: int) -> int:
    """Position (1..n) in a List that will have n = others_count + 1 items whose score is
    closest to `score`; ties go to the better position."""
    n = others_count + 1
    return min(range(1, n + 1), key=lambda i: (abs(personal_score(bucket, i, n) - score), i))


async def reinsert(db: AsyncSession, ranking: Ranking, city_id: int, subcategory_id: int) -> None:
    """R4.9: move a ranking into the user's List for a new (city, subcategory), keeping its
    bucket, at the position whose score is closest to its old personal score. Both Lists are
    recomputed and their aggregates refreshed."""
    old_key = _key_of(ranking)
    new_key = ListKey(ranking.user_id, city_id, subcategory_id, ranking.bucket)
    if old_key == new_key:
        return
    old_score = ranking.personal_score
    keys = sorted({old_key, new_key}, key=lambda k: (k.city_id, k.subcategory_id))
    locked = {k: await _lock_list(db, k) for k in keys}

    others = [r for r in await _items(db, new_key) if r.id != ranking.id]
    position = nearest_score_position(ranking.bucket, old_score, len(others))
    others.insert(position - 1, ranking)
    _write_order(new_key, others)
    locked[new_key].version += 1

    remaining = [r for r in await _items(db, old_key) if r.id != ranking.id]
    _write_order(old_key, remaining)
    locked[old_key].version += 1
    await db.flush()
    # Every item in both Lists was rescored, so refresh all their places' aggregates here
    # (callers such as merge may not know which places were touched).
    await scores.refresh_aggregates(
        db,
        {r.place_id for r in others} | {r.place_id for r in remaining},
        [(old_key.city_id, old_key.subcategory_id), (city_id, subcategory_id)],
    )


async def reinsert_place_rankings(
    db: AsyncSession, place: Place, old_city_id: int, old_subcategory_id: int
) -> None:
    """After a place's (city, subcategory) changed (edit, applied fix): slide every ranking of
    it into the right List and refresh aggregates for both categories."""
    rankings = list(
        (await db.execute(select(Ranking).where(Ranking.place_id == place.id))).scalars()
    )
    for r in rankings:
        await reinsert(db, r, place.city_id, place.subcategory_id)
    await db.flush()
    # Rankings in the touched Lists were rescored: refresh every place they belong to.
    affected = (
        await db.execute(
            select(Ranking.place_id).where(
                Ranking.user_id.in_({r.user_id for r in rankings}),
                ((Ranking.city_id == old_city_id) & (Ranking.subcategory_id == old_subcategory_id))
                | (
                    (Ranking.city_id == place.city_id)
                    & (Ranking.subcategory_id == place.subcategory_id)
                ),
            )
        )
    ).scalars()
    await scores.refresh_aggregates(
        db,
        {place.id, *affected},
        [(old_city_id, old_subcategory_id), (place.city_id, place.subcategory_id)],
    )
