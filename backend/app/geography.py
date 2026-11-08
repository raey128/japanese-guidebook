"""Geography: curated cities and locations, and location suggestion for a point."""

from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import City, Location


@dataclass(frozen=True)
class Suggestion:
    location: Location | None
    city: City | None
    outside_coverage: bool
    distance_m: float | None


async def suggest_location(db: AsyncSession, lat: float, lng: float) -> Suggestion:
    """Nearest non-catch-all location centroid; `outside_coverage` beyond the radius."""
    row = (
        await db.execute(
            text(
                """
                SELECT l.id,
                       ST_Distance(l.centroid::geography,
                                   ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS d
                FROM locations l
                WHERE NOT l.is_catch_all AND l.centroid IS NOT NULL
                ORDER BY l.centroid <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
                LIMIT 5
                """
            ),
            {"lat": lat, "lng": lng},
        )
    ).all()
    if not row:
        return Suggestion(None, None, True, None)
    # `<->` on geometry is planar; re-pick the true nearest among the top few by geodesic distance.
    location_id, distance_m = min(row, key=lambda r: r.d)
    if distance_m > get_settings().coverage_radius_km * 1000:
        return Suggestion(None, None, True, distance_m)
    location = await db.get(Location, location_id)
    assert location is not None
    city = await db.get(City, location.city_id)
    return Suggestion(location, city, False, distance_m)


async def list_cities(db: AsyncSession) -> list[City]:
    return list((await db.execute(select(City).order_by(City.id))).scalars())


async def city_locations(db: AsyncSession, city_id: int) -> list[Location]:
    """All locations of a city, named ones by name then the catch-all last."""
    result = await db.execute(
        select(Location)
        .where(Location.city_id == city_id)
        .order_by(Location.is_catch_all, Location.name)
    )
    return list(result.scalars())
