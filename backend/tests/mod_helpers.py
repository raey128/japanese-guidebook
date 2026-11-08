"""Shared setup for the moderation and dump tests (flags, admin, merge, dump)."""

from sqlalchemy import text

from app import ranking
from app.models import Place, Ranking, User
from tests.factories import make_place, make_user, sign_in, user_by_name


async def signed_in(client_factory, name: str):
    c = client_factory()
    await sign_in(c, name)
    return c


async def admin_client(client_factory, db, name: str = "boss"):
    c = await signed_in(client_factory, name)
    (await user_by_name(db, name)).is_admin = True
    await db.flush()
    return c


async def rank(
    db, user: User, place: Place, bucket: str = "liked", position: int = 1, note: str | None = None
) -> Ranking:
    """Rank `place` for `user` straight through the ranking service (no HTTP)."""
    snap = await ranking.get_snapshot(db, user.id, place.city_id, place.subcategory_id)
    r = await ranking.place_ranking(
        db,
        user_id=user.id,
        place=place,
        bucket=bucket,
        position=position,
        expected_version=snap[bucket].version,
    )
    if note is not None:
        await ranking.update_note(db, r, note=note, visit_month=None, visit_year=None)
    return r


async def flag(client, place_id: int, flag_type: str, payload: dict | None = None):
    body: dict = {"flag_type": flag_type}
    if payload is not None:
        body["payload"] = payload
    return await client.post(f"/api/places/{place_id}/flags", json=body)


async def list_names(db, user_id: int, subcategory_slug: str, bucket: str = "liked") -> list[str]:
    rows = await db.execute(
        text(
            """
            SELECT p.name FROM rankings r
            JOIN places p ON p.id = r.place_id
            JOIN subcategories s ON s.id = r.subcategory_id
            WHERE r.user_id = :u AND s.slug = :s AND r.bucket = :b
            ORDER BY r.position
            """
        ),
        {"u": user_id, "s": subcategory_slug, "b": bucket},
    )
    return [r.name for r in rows]


async def category_count(db, place: Place) -> int:
    return (
        await db.execute(
            text(
                "SELECT COALESCE(SUM(rank_count), 0) FROM category_stats "
                "WHERE city_id = :c AND subcategory_id = :s"
            ),
            {"c": place.city_id, "s": place.subcategory_id},
        )
    ).scalar_one()


__all__ = [
    "admin_client",
    "category_count",
    "flag",
    "list_names",
    "make_place",
    "make_user",
    "rank",
    "signed_in",
    "user_by_name",
]
