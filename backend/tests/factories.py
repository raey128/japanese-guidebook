"""Test helpers. Prefer driving behaviour through the API; these only set up preconditions."""

from datetime import datetime

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Location, Place, Subcategory, User

# Real centroids from data/locations.csv
ASAKUSA = (35.7120, 139.7960)
SHIBUYA = (35.6595, 139.7005)
GION = (35.0037, 135.7788)


async def sign_in(client: httpx.AsyncClient, username: str) -> dict:
    """Create (if needed) and sign in `username` on this client. Returns the user JSON."""
    r = await client.post("/api/auth/sign-in", json={"username": username, "create": True})
    assert r.status_code == 200, r.text
    return r.json()["user"]


async def user_by_name(db: AsyncSession, username: str) -> User:
    return (await db.execute(select(User).where(User.username == username))).scalar_one()


async def make_user(
    db: AsyncSession, username: str, *, is_admin: bool = False, is_private: bool = False
) -> User:
    user = User(username=username, is_admin=is_admin, is_private=is_private)
    db.add(user)
    await db.flush()
    return user


async def location(db: AsyncSession, slug: str) -> Location:
    return (await db.execute(select(Location).where(Location.slug == slug))).scalar_one()


async def subcategory(db: AsyncSession, slug: str) -> Subcategory:
    return (await db.execute(select(Subcategory).where(Subcategory.slug == slug))).scalar_one()


async def make_place(
    db: AsyncSession,
    *,
    name: str,
    creator: User,
    subcategory_slug: str = "ramen",
    location_slug: str = "asakusa",
    lat: float | None = None,
    lng: float | None = None,
    name_ja: str | None = None,
    is_hidden: bool = False,
    is_closed: bool = False,
    is_seed: bool = False,
    created_at: datetime | None = None,
) -> Place:
    loc = await location(db, location_slug)
    sub = await subcategory(db, subcategory_slug)
    if lat is None or lng is None:
        row = (
            await db.execute(
                text("SELECT ST_Y(centroid) lat, ST_X(centroid) lng FROM locations WHERE id=:id"),
                {"id": loc.id},
            )
        ).one()
        lat, lng = (row.lat, row.lng) if row.lat is not None else ASAKUSA
    place_id = (
        await db.execute(
            text(
                """
                INSERT INTO places (name, name_ja, geom, subcategory_id, location_id, city_id,
                                    creator_id, is_hidden, is_closed, is_seed, created_at)
                VALUES (:name, :name_ja, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :sub, :loc,
                        :city, :creator, :hidden, :closed, :seed, COALESCE(:created_at, now()))
                RETURNING id
                """
            ),
            {
                "name": name,
                "name_ja": name_ja,
                "lat": lat,
                "lng": lng,
                "sub": sub.id,
                "loc": loc.id,
                "city": loc.city_id,
                "creator": creator.id,
                "hidden": is_hidden,
                "closed": is_closed,
                "seed": is_seed,
                "created_at": created_at,
            },
        )
    ).scalar_one()
    place = await db.get(Place, place_id)
    assert place is not None
    return place
