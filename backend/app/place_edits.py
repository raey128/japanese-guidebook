"""Changing a place's name, pin, subcategory or location.

Shared by creator/admin edits (routers/places.py) and applied moderation fixes. Keeps the
denormalised city_id in step with location_id and, when the place moves to a different
(city, subcategory), slides every ranking of it into the right List (R4.9).
Permission checks are the caller's job.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import ranking
from app.models import Location, Place, Subcategory


class PlaceEditError(ValueError):
    pass


async def apply_place_changes(
    db: AsyncSession,
    place: Place,
    *,
    name: str | None = None,
    name_ja: str | None = None,
    clear_name_ja: bool = False,
    lat: float | None = None,
    lng: float | None = None,
    subcategory_id: int | None = None,
    location_id: int | None = None,
) -> Place:
    """Apply only the given fields. Returns the refreshed place."""
    old_city, old_sub = place.city_id, place.subcategory_id

    if name is not None:
        name = name.strip()
        if not name:
            raise PlaceEditError("English name is required.")
        place.name = name
    if clear_name_ja:
        place.name_ja = None
    elif name_ja is not None:
        place.name_ja = name_ja.strip() or None
    if subcategory_id is not None:
        if await db.get(Subcategory, subcategory_id) is None:
            raise PlaceEditError("Unknown subcategory.")
        place.subcategory_id = subcategory_id
    if location_id is not None:
        loc = await db.get(Location, location_id)
        if loc is None:
            raise PlaceEditError("Unknown location.")
        place.location_id = loc.id
        place.city_id = loc.city_id
    await db.flush()

    if (lat is None) != (lng is None):
        raise PlaceEditError("Give both lat and lng.")
    if lat is not None and lng is not None:
        await db.execute(
            text(
                "UPDATE places SET geom = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) WHERE id = :id"
            ),
            {"lat": lat, "lng": lng, "id": place.id},
        )

    if (place.city_id, place.subcategory_id) != (old_city, old_sub):
        await ranking.reinsert_place_rankings(db, place, old_city, old_sub)
    await db.refresh(place)
    return place
